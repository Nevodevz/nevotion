"""CEO Dashboard analytics service — aggregations in Asia/Bishkek timezone."""
from datetime import date, datetime, timezone, timedelta
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models import (
    Lead, LeadStage, Meeting, Deal, DealPayment, FinanceTransaction,
    AdExpense, PayrollRecord, MonthlyPlan, LeadSource, Service, Account, AccountBalance, Debt,
)
from app.services.marketing import marketing_totals, source_metrics

BISHKEK_OFFSET = timezone(timedelta(hours=6))


def _now_bk() -> datetime:
    return datetime.now(BISHKEK_OFFSET)


def _today_bk() -> date:
    return _now_bk().date()


def _month_start_bk(d: date | None = None) -> date:
    d = d or _today_bk()
    return d.replace(day=1)


def _date_range_for_month(year: int, month: int):
    start = date(year, month, 1)
    if month == 12:
        end = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        end = date(year, month + 1, 1) - timedelta(days=1)
    return start, end


def dashboard_metrics(db: Session, date_from: Optional[date], date_to: Optional[date]) -> dict:
    today = _today_bk()
    yesterday = today - timedelta(days=1)
    month_start = _month_start_bk(today)

    # ── Leads ──
    leads_today = db.query(func.count(Lead.id)).filter(
        func.date(Lead.created_at) == today
    ).scalar() or 0

    leads_yesterday = db.query(func.count(Lead.id)).filter(
        func.date(Lead.created_at) == yesterday
    ).scalar() or 0

    leads_month = db.query(func.count(Lead.id)).filter(
        func.date(Lead.created_at) >= month_start,
        func.date(Lead.created_at) <= today,
    ).scalar() or 0

    # ── Meetings ──
    meetings_scheduled = db.query(func.count(Meeting.id)).filter(
        Meeting.status == "scheduled",
        func.date(Meeting.meeting_date) >= month_start,
    ).scalar() or 0

    meetings_conducted = db.query(func.count(Meeting.id)).filter(
        Meeting.status.in_(["closed", "minus", "push"]),
        func.date(Meeting.meeting_date) >= month_start,
        func.date(Meeting.meeting_date) <= today,
    ).scalar() or 0

    # ── Sales (paid deals) ──
    sales_yesterday = db.query(func.count(Deal.id)).filter(
        Deal.status == "paid",
        Deal.payment_date == yesterday,
    ).scalar() or 0

    sales_month = db.query(func.count(Deal.id)).filter(
        Deal.status == "paid",
        Deal.payment_date >= month_start,
        Deal.payment_date <= today,
    ).scalar() or 0

    # ── Revenue ──
    revenue_month = db.query(func.coalesce(func.sum(Deal.paid_amount), 0)).filter(
        Deal.status == "paid",
        Deal.payment_date >= month_start,
        Deal.payment_date <= today,
    ).scalar() or 0

    # ── Monthly plan ──
    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == today.year,
        MonthlyPlan.month == today.month,
    ).first()
    plan_revenue = plan.plan_revenue if plan else 0

    # ── CPL / CAC (reuse marketing service for current month) ──
    mkt = marketing_totals(db, month_start, today)
    cpl = mkt["cpl"]
    cac = mkt["cac"]

    # ── Money on accounts (latest balances) ──
    balances_subq = (
        db.query(AccountBalance.account_id, func.max(AccountBalance.date).label("max_date"))
        .group_by(AccountBalance.account_id)
        .subquery()
    )
    latest_balances = (
        db.query(AccountBalance)
        .join(balances_subq,
              (AccountBalance.account_id == balances_subq.c.account_id) &
              (AccountBalance.date == balances_subq.c.max_date))
        .all()
    )
    total_on_accounts = sum(b.balance for b in latest_balances)

    # ── Deals pipeline ──
    won_stage_ids = {s.id for s in db.query(LeadStage).filter(LeadStage.is_won == True).all()}

    # "Pending" now covers partially-paid deals too, and the outstanding figure
    # is the unpaid remainder rather than the whole deal amount.
    pending_deals = db.query(Deal).filter(Deal.status.in_(["pending", "partial"])).all()
    pending_amount = sum(max(int(d.amount or 0) - int(d.paid_amount or 0), 0) for d in pending_deals)
    pending_count = len(pending_deals)

    # leads in contract stage (ожидание оплаты) — summed from their deals
    contract_stages = db.query(LeadStage).filter(
        LeadStage.name.in_(["Договор", "Ожидание оплаты"])
    ).all()
    contract_stage_ids = {s.id for s in contract_stages}
    waiting_leads_amount = 0
    if contract_stage_ids:
        waiting_leads_amount = db.query(
            func.coalesce(func.sum(Deal.amount - Deal.paid_amount), 0)
        ).join(Lead, Lead.id == Deal.lead_id).filter(
            Lead.stage_id.in_(contract_stage_ids),
            Deal.status != "paid",
        ).scalar() or 0
        waiting_leads_amount = max(int(waiting_leads_amount), 0)

    # ── Expenses this month ──
    expenses_month = db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0)).filter(
        FinanceTransaction.type == "expense",
        FinanceTransaction.date >= month_start,
        FinanceTransaction.date <= today,
    ).scalar() or 0

    fot_month = db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0)).filter(
        FinanceTransaction.type == "expense",
        FinanceTransaction.category.in_(["ФОТ", "Бонусы"]),
        FinanceTransaction.date >= month_start,
        FinanceTransaction.date <= today,
    ).scalar() or 0

    profit_month = revenue_month - expenses_month

    # ── Conversions ──
    leads_total_month = leads_month or 1  # avoid div/0
    conv_lead_meeting = round(meetings_conducted / leads_total_month * 100, 1)
    conv_meeting_sale = round(sales_month / max(meetings_conducted, 1) * 100, 1)
    conv_lead_sale = round(sales_month / leads_total_month * 100, 1)

    avg_check = round(revenue_month / sales_month) if sales_month > 0 else 0

    # ── Cashflow forecast (simple) ──
    today_fin = date.today()
    # Expected income comes from the payment schedule (outstanding part only).
    plan_income_30 = db.query(
        func.coalesce(func.sum(DealPayment.planned_amount - DealPayment.paid_amount), 0)
    ).filter(
        DealPayment.status.notin_(["paid", "cancelled"]),
        DealPayment.planned_date >= today_fin,
        DealPayment.planned_date <= today_fin + timedelta(days=30),
    ).scalar() or 0
    plan_income_30 = max(int(plan_income_30), 0)

    monthly_expense_rate = expenses_month or 1
    forecast_7 = total_on_accounts - int(monthly_expense_rate * 7 / 30)
    forecast_30 = total_on_accounts + plan_income_30 - monthly_expense_rate

    return {
        "leads_today": leads_today,
        "leads_yesterday": leads_yesterday,
        "leads_month": leads_month,
        "meetings_scheduled": meetings_scheduled,
        "meetings_conducted": meetings_conducted,
        "sales_yesterday": sales_yesterday,
        "sales_month": sales_month,
        "revenue_month": revenue_month,
        "plan_revenue_month": plan_revenue,
        "revenue_vs_plan_pct": round(revenue_month / plan_revenue * 100) if plan_revenue > 0 else None,
        "cpl": cpl,
        "cac": cac,
        "total_on_accounts": total_on_accounts,
        "pending_amount": pending_amount,
        "pending_count": pending_count,
        "waiting_leads_amount": waiting_leads_amount,
        "expenses_month": expenses_month,
        "fot_month": fot_month,
        "profit_month": profit_month,
        "avg_check": avg_check,
        "conv_lead_meeting_pct": conv_lead_meeting,
        "conv_meeting_sale_pct": conv_meeting_sale,
        "conv_lead_sale_pct": conv_lead_sale,
        "cashflow_7d": forecast_7,
        "cashflow_30d": forecast_30,
        "cashflow_warning": forecast_7 < 0,
    }


def charts_data(db: Session, date_from: Optional[date], date_to: Optional[date]) -> dict:
    today = _today_bk()
    d_from = date_from or (_month_start_bk())
    d_to = date_to or today

    # ── Daily dynamics ──
    def _date_series(d_start: date, d_end: date):
        days = []
        cur = d_start
        while cur <= d_end:
            days.append(cur)
            cur += timedelta(days=1)
        return days

    days = _date_series(d_from, d_to)

    # leads per day
    leads_raw = db.query(
        func.date(Lead.created_at).label("d"),
        func.count(Lead.id).label("cnt"),
    ).filter(
        func.date(Lead.created_at) >= d_from,
        func.date(Lead.created_at) <= d_to,
    ).group_by(func.date(Lead.created_at)).all()
    leads_by_day = {str(r.d): r.cnt for r in leads_raw}

    # meetings per day
    meetings_raw = db.query(
        func.date(Meeting.meeting_date).label("d"),
        func.count(Meeting.id).label("cnt"),
    ).filter(
        func.date(Meeting.meeting_date) >= d_from,
        func.date(Meeting.meeting_date) <= d_to,
    ).group_by(func.date(Meeting.meeting_date)).all()
    meetings_by_day = {str(r.d): r.cnt for r in meetings_raw}

    # sales per day
    sales_raw = db.query(
        Deal.payment_date.label("d"),
        func.count(Deal.id).label("cnt"),
        func.coalesce(func.sum(Deal.paid_amount), 0).label("revenue"),
    ).filter(
        Deal.status == "paid",
        Deal.payment_date >= d_from,
        Deal.payment_date <= d_to,
    ).group_by(Deal.payment_date).all()
    sales_by_day = {str(r.d): {"count": r.cnt, "revenue": r.revenue} for r in sales_raw}

    daily = []
    for d in days:
        ds = str(d)
        daily.append({
            "date": ds,
            "leads": leads_by_day.get(ds, 0),
            "meetings": meetings_by_day.get(ds, 0),
            "sales": sales_by_day.get(ds, {}).get("count", 0),
            "revenue": sales_by_day.get(ds, {}).get("revenue", 0),
        })

    # ── Funnel by stages (archived stages are not part of the active funnel) ──
    stages = db.query(LeadStage).filter(
        LeadStage.is_archived == False  # noqa: E712
    ).order_by(LeadStage.position).all()
    funnel = []
    for stage in stages:
        cnt = db.query(func.count(Lead.id)).filter(Lead.stage_id == stage.id).scalar() or 0
        funnel.append({
            "stage_id": stage.id,
            "stage_name": stage.name,
            "count": cnt,
            "color": stage.color,
            "is_won": stage.is_won,
            "is_lost": stage.is_lost,
        })

    # ── Lead sources pie ──
    sources_raw = db.query(
        Lead.source_id,
        func.count(Lead.id).label("cnt"),
    ).filter(
        func.date(Lead.created_at) >= d_from,
        func.date(Lead.created_at) <= d_to,
        Lead.source_id.isnot(None),
    ).group_by(Lead.source_id).all()

    source_map = {s.id: s.name for s in db.query(LeadSource).all()}
    total_sourced = sum(r.cnt for r in sources_raw) or 1
    sources_pie = [
        {
            "source_id": r.source_id,
            "name": source_map.get(r.source_id, "—"),
            "count": r.cnt,
            "pct": round(r.cnt / total_sourced * 100, 1),
        }
        for r in sources_raw
    ]

    # ── Expense categories ──
    exp_raw = db.query(
        FinanceTransaction.category,
        func.coalesce(func.sum(FinanceTransaction.amount), 0).label("total"),
    ).filter(
        FinanceTransaction.type == "expense",
        FinanceTransaction.date >= d_from,
        FinanceTransaction.date <= d_to,
    ).group_by(FinanceTransaction.category).all()

    # ad expenses as separate "Реклама" bucket
    ad_exp = db.query(func.coalesce(func.sum(AdExpense.amount), 0)).filter(
        AdExpense.date >= d_from,
        AdExpense.date <= d_to,
    ).scalar() or 0

    expense_categories = [
        {"name": r.category or "Без категории", "amount": r.total}
        for r in exp_raw
    ]
    if ad_exp:
        expense_categories.append({"name": "Реклама", "amount": ad_exp})

    # ── Revenue by service ──
    service_raw = db.query(
        Lead.service_id,
        func.coalesce(func.sum(Deal.paid_amount), 0).label("revenue"),
        func.count(Deal.id).label("cnt"),
    ).join(Deal, Deal.lead_id == Lead.id).filter(
        Deal.status == "paid",
        Deal.payment_date >= d_from,
        Deal.payment_date <= d_to,
        Lead.service_id.isnot(None),
    ).group_by(Lead.service_id).all()

    service_map = {s.id: s.name for s in db.query(Service).all()}
    revenue_by_service = [
        {
            "service_id": r.service_id,
            "name": service_map.get(r.service_id, "—"),
            "revenue": r.revenue,
            "count": r.cnt,
        }
        for r in service_raw
    ]

    return {
        "daily": daily,
        "funnel": funnel,
        "sources_pie": sources_pie,
        "expense_categories": expense_categories,
        "revenue_by_service": revenue_by_service,
    }


def problems(db: Session) -> list[dict]:
    today = _today_bk()
    month_start = _month_start_bk()
    issues = []

    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == today.year,
        MonthlyPlan.month == today.month,
    ).first()

    # Days elapsed this month
    days_elapsed = (today - month_start).days + 1
    days_in_month = 30

    # ── Leads pace ──
    leads_month = db.query(func.count(Lead.id)).filter(
        func.date(Lead.created_at) >= month_start,
        func.date(Lead.created_at) <= today,
    ).scalar() or 0

    if plan and plan.plan_leads > 0:
        expected_by_now = int(plan.plan_leads * days_elapsed / days_in_month)
        if leads_month < expected_by_now * 0.8:
            issues.append({
                "severity": "error",
                "message": f"Лидов меньше нормы: {leads_month} из ожидаемых {expected_by_now} на {days_elapsed}-й день месяца",
                "link": "/leads",
            })

    # ── Meetings pace ──
    meetings_month = db.query(func.count(Meeting.id)).filter(
        func.date(Meeting.meeting_date) >= month_start,
        func.date(Meeting.meeting_date) <= today,
    ).scalar() or 0

    if plan and plan.plan_meetings > 0 and meetings_month < plan.plan_meetings * days_elapsed / days_in_month * 0.7:
        issues.append({
            "severity": "warning",
            "message": f"Мало назначенных встреч: {meetings_month} за месяц",
            "link": None,
        })

    # ── CPL vs plan ──
    mkt = marketing_totals(db, month_start, today)
    if plan and plan.plan_cpl > 0 and mkt["cpl"] > plan.plan_cpl * 1.2:
        issues.append({
            "severity": "warning",
            "message": f"CPL выше плана: {mkt['cpl']} сом (план {plan.plan_cpl} сом)",
            "link": None,
        })

    # ── Leads without next action ──
    no_action_count = db.query(func.count(Lead.id)).filter(
        Lead.status == "active",
        Lead.next_action_type == "",
    ).scalar() or 0
    if no_action_count > 5:
        issues.append({
            "severity": "warning",
            "message": f"{no_action_count} активных лидов без следующего действия",
            "link": "/leads",
        })

    # ── Overdue next action ──
    overdue_count = db.query(func.count(Lead.id)).filter(
        Lead.status == "active",
        Lead.next_action_at.isnot(None),
        Lead.next_action_at < datetime.now(BISHKEK_OFFSET),
    ).scalar() or 0
    if overdue_count > 0:
        issues.append({
            "severity": "error",
            "message": f"{overdue_count} лидов с просроченным следующим действием",
            "link": "/leads",
        })

    # ── Overdue expected payments ──
    overdue_payments = db.query(func.count(DealPayment.id)).filter(
        DealPayment.status.notin_(["paid", "cancelled"]),
        DealPayment.planned_date < today,
        DealPayment.planned_amount > DealPayment.paid_amount,
    ).scalar() or 0
    if overdue_payments > 0:
        issues.append({
            "severity": "error",
            "message": f"{overdue_payments} сделок с просроченной датой оплаты",
            "link": None,
        })

    # ── Cashflow warning ──
    balances_subq = (
        db.query(AccountBalance.account_id, func.max(AccountBalance.date).label("max_date"))
        .group_by(AccountBalance.account_id).subquery()
    )
    latest_balances = (
        db.query(AccountBalance)
        .join(balances_subq,
              (AccountBalance.account_id == balances_subq.c.account_id) &
              (AccountBalance.date == balances_subq.c.max_date))
        .all()
    )
    total_on_accounts = sum(b.balance for b in latest_balances)
    expenses_month = db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0)).filter(
        FinanceTransaction.type == "expense",
        FinanceTransaction.date >= month_start,
        FinanceTransaction.date <= today,
    ).scalar() or 0

    if expenses_month > 0:
        forecast_7 = total_on_accounts - int(expenses_month * 7 / 30)
        if forecast_7 < 0:
            issues.append({
                "severity": "critical",
                "message": f"Возможен кассовый разрыв через 7 дней (прогноз: {forecast_7:,} сом)",
                "link": "/finance",
            })

    # ── Expenses vs plan ──
    if plan and plan.plan_expenses > 0 and expenses_month > plan.plan_expenses:
        issues.append({
            "severity": "warning",
            "message": f"Расходы превышают план: {expenses_month:,} сом (план {plan.plan_expenses:,} сом)",
            "link": "/finance",
        })

    return issues


def kpi_plan_fact(db: Session, year: int, month: int) -> dict:
    d_from, d_to = _date_range_for_month(year, month)
    today = _today_bk()
    effective_to = min(d_to, today)

    plan = db.query(MonthlyPlan).filter(
        MonthlyPlan.year == year,
        MonthlyPlan.month == month,
    ).first()

    # ── Facts ──
    fact_revenue = db.query(func.coalesce(func.sum(Deal.paid_amount), 0)).filter(
        Deal.status == "paid",
        Deal.payment_date >= d_from,
        Deal.payment_date <= d_to,
    ).scalar() or 0

    fact_leads = db.query(func.count(Lead.id)).filter(
        func.date(Lead.created_at) >= d_from,
        func.date(Lead.created_at) <= d_to,
    ).scalar() or 0

    fact_meetings = db.query(func.count(Meeting.id)).filter(
        func.date(Meeting.meeting_date) >= d_from,
        func.date(Meeting.meeting_date) <= d_to,
    ).scalar() or 0

    fact_sales = db.query(func.count(Deal.id)).filter(
        Deal.status == "paid",
        Deal.payment_date >= d_from,
        Deal.payment_date <= d_to,
    ).scalar() or 0

    mkt = marketing_totals(db, d_from, effective_to)
    fact_cpl = mkt["cpl"]
    fact_cac = mkt["cac"]

    fact_expenses = db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0)).filter(
        FinanceTransaction.type == "expense",
        FinanceTransaction.date >= d_from,
        FinanceTransaction.date <= d_to,
    ).scalar() or 0

    def _pct(fact, plan_val):
        if not plan_val:
            return None
        return round(fact / plan_val * 100, 1)

    def _pct_inv(fact, plan_val):
        """For CPL/CAC lower is better."""
        if not plan_val or not fact:
            return None
        return round(plan_val / fact * 100, 1)

    p = plan

    metrics = [
        {
            "key": "revenue",
            "label": "Выручка",
            "unit": "сом",
            "plan": p.plan_revenue if p else 0,
            "fact": fact_revenue,
            "pct": _pct(fact_revenue, p.plan_revenue if p else 0),
            "higher_is_better": True,
        },
        {
            "key": "leads",
            "label": "Лидов",
            "unit": "шт",
            "plan": p.plan_leads if p else 0,
            "fact": fact_leads,
            "pct": _pct(fact_leads, p.plan_leads if p else 0),
            "higher_is_better": True,
        },
        {
            "key": "meetings",
            "label": "Встреч",
            "unit": "шт",
            "plan": p.plan_meetings if p else 0,
            "fact": fact_meetings,
            "pct": _pct(fact_meetings, p.plan_meetings if p else 0),
            "higher_is_better": True,
        },
        {
            "key": "sales",
            "label": "Продаж",
            "unit": "шт",
            "plan": p.plan_sales if p else 0,
            "fact": fact_sales,
            "pct": _pct(fact_sales, p.plan_sales if p else 0),
            "higher_is_better": True,
        },
        {
            "key": "cpl",
            "label": "CPL",
            "unit": "сом",
            "plan": p.plan_cpl if p else 0,
            "fact": fact_cpl,
            "pct": _pct_inv(fact_cpl, p.plan_cpl if p else 0),
            "higher_is_better": False,
        },
        {
            "key": "cac",
            "label": "CAC",
            "unit": "сом",
            "plan": p.plan_cac if p else 0,
            "fact": fact_cac,
            "pct": _pct_inv(fact_cac, p.plan_cac if p else 0),
            "higher_is_better": False,
        },
        {
            "key": "expenses",
            "label": "Расходы",
            "unit": "сом",
            "plan": p.plan_expenses if p else 0,
            "fact": fact_expenses,
            "pct": _pct_inv(fact_expenses, p.plan_expenses if p else 0),
            "higher_is_better": False,
        },
    ]

    return {
        "year": year,
        "month": month,
        "plan_id": p.id if p else None,
        "metrics": metrics,
    }
