from datetime import date, datetime, timezone, timedelta
from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import (
    Task, Board, User, Role,
    Meeting, MeetingStatus,
    Lead, LeadStatus, LeadStage,
    Deal,
    AccountBalance, FinanceTransaction,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

_BISHKEK = timezone(timedelta(hours=6))


def _is_finance_admin(user: User) -> bool:
    return user.role == Role.admin or user.is_founder or user.position == "Финансовый директор"


def _is_sales(user: User) -> bool:
    return user.position in ("Сеттер", "Клоузер", "Руководитель продаж") or user.role == Role.admin or user.is_founder


def _notif(nid: str, kind: str, severity: str, title: str, meta: str = "", link: str | None = None, **extra: Any) -> dict:
    return {"id": nid, "kind": kind, "severity": severity, "title": title, "meta": meta, "link": link, **extra}


@router.get("")
def get_notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    now_utc = datetime.now(timezone.utc)
    now_bk = now_utc.astimezone(_BISHKEK)
    today_bk = now_bk.date()

    notifs: list[dict] = []

    # ─── 1. Overdue tasks (owner = me) ────────────────────────────
    overdue_tasks = (
        db.query(Task).options(joinedload(Task.board))
        .filter(Task.owner_id == user.id, Task.due_date < today_bk, Task.completed_at.is_(None))
        .limit(15).all()
    )
    for t in overdue_tasks:
        notifs.append(_notif(
            f"overdue_{t.id}", "overdue", "warning",
            f"Просрочено: {t.title}",
            f"Срок был {t.due_date.strftime('%d.%m')}",
            link=f"/team/{user.id}",
            board_id=t.board_id, task_id=t.id, owner_id=t.owner_id,
        ))

    # ─── 2. Tasks assigned to me ──────────────────────────────────
    assigned_tasks = (
        db.query(Task).options(joinedload(Task.requester))
        .filter(
            Task.owner_id == user.id,
            Task.requester_id.isnot(None),
            Task.requester_id != user.id,
            Task.completed_at.is_(None),
        )
        .order_by(Task.id.desc()).limit(10).all()
    )
    for t in assigned_tasks:
        who = t.requester.name if t.requester else "Кто-то"
        notifs.append(_notif(
            f"assigned_{t.id}", "assigned", "info",
            f"{who} назначил: {t.title}",
            f"Приоритет: {t.priority.value}",
            link=f"/team/{user.id}",
            board_id=t.board_id, task_id=t.id, owner_id=t.owner_id,
        ))

    # ─── 3. Admin: shared board overdue tasks ─────────────────────
    if user.role == Role.admin or user.is_founder:
        shared_overdue = (
            db.query(Task).join(Board)
            .filter(
                Board.kind.in_(["backend_queue", "qcc"]),
                Task.due_date < today_bk,
                Task.completed_at.is_(None),
            ).limit(8).all()
        )
        for t in shared_overdue:
            notifs.append(_notif(
                f"shared_overdue_{t.id}", "overdue", "warning",
                f"[Команда] Просрочено: {t.title}",
                f"Срок был {t.due_date.strftime('%d.%m')}",
                link="/dept/dev",
                board_id=t.board_id, task_id=t.id,
            ))

    # ─── 4. Meetings: today (Asia/Bishkek) ───────────────────────
    today_start = now_bk.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start.astimezone(timezone.utc)
    today_end_utc = (today_start + timedelta(days=1)).astimezone(timezone.utc)

    meetings_today = (
        db.query(Meeting)
        .filter(
            Meeting.meeting_date >= today_start_utc,
            Meeting.meeting_date < today_end_utc,
            Meeting.status == MeetingStatus.scheduled,
            (Meeting.closer_id == user.id) | (Meeting.setter_id == user.id),
        ).limit(10).all()
    )
    for m in meetings_today:
        mt = m.meeting_date.astimezone(_BISHKEK)
        role_label = "Вы клоузер" if m.closer_id == user.id else "Вы сеттер"
        notifs.append(_notif(
            f"meeting_today_{m.id}", "meeting_today", "critical",
            f"Встреча сегодня: {m.client_name}",
            f"{mt.strftime('%H:%M')} · {role_label}",
            link="/dept/sales/meetings",
        ))

    # ─── 5. Upcoming meetings (next 7 days, user is closer/setter) ─
    upcoming_start_utc = today_end_utc  # tomorrow 00:00 bishkek
    upcoming_end_utc = (today_start + timedelta(days=7)).astimezone(timezone.utc)

    upcoming_meetings = (
        db.query(Meeting)
        .filter(
            Meeting.meeting_date >= upcoming_start_utc,
            Meeting.meeting_date < upcoming_end_utc,
            Meeting.status == MeetingStatus.scheduled,
            (Meeting.closer_id == user.id) | (Meeting.setter_id == user.id),
        ).order_by(Meeting.meeting_date).limit(5).all()
    )
    for m in upcoming_meetings:
        mt = m.meeting_date.astimezone(_BISHKEK)
        role_label = "Вы клоузер" if m.closer_id == user.id else "Вы сеттер"
        notifs.append(_notif(
            f"meeting_upcoming_{m.id}", "meeting", "info",
            f"Встреча {mt.strftime('%d.%m')}: {m.client_name}",
            f"{mt.strftime('%H:%M')} · {role_label}",
            link="/dept/sales/meetings",
        ))

    # ─── 6. Overdue next_action on leads (setter/closer) ─────────
    if _is_sales(user):
        overdue_action_q = (
            db.query(Lead)
            .filter(
                Lead.status == LeadStatus.active,
                Lead.next_action_at.isnot(None),
                Lead.next_action_at < now_utc,
            )
        )
        if not (user.role == Role.admin or user.is_founder):
            overdue_action_q = overdue_action_q.filter(
                (Lead.setter_id == user.id) | (Lead.closer_id == user.id)
            )
        overdue_actions = overdue_action_q.limit(10).all()
        for lead in overdue_actions:
            na = lead.next_action_at.astimezone(_BISHKEK) if lead.next_action_at.tzinfo else lead.next_action_at.replace(tzinfo=timezone.utc).astimezone(_BISHKEK)
            notifs.append(_notif(
                f"lead_action_overdue_{lead.id}", "lead_overdue", "warning",
                f"Просрочено действие: {lead.client_name or lead.company_name}",
                f"Было {na.strftime('%d.%m %H:%M')} · {lead.next_action_type or 'действие'}",
                link=f"/leads/{lead.id}",
            ))

    # ─── 7. Active leads without next_action (setter/closer) ─────
    if _is_sales(user):
        # Final stages (won/lost) — don't need next action
        final_stage_ids = [s.id for s in db.query(LeadStage).filter(
            (LeadStage.is_won == True) | (LeadStage.is_lost == True)
        ).all()]

        no_action_q = (
            db.query(Lead)
            .filter(
                Lead.status == LeadStatus.active,
                Lead.next_action_at.is_(None),
            )
        )
        if final_stage_ids:
            no_action_q = no_action_q.filter(Lead.stage_id.notin_(final_stage_ids))
        if not (user.role == Role.admin or user.is_founder):
            no_action_q = no_action_q.filter(
                (Lead.setter_id == user.id) | (Lead.closer_id == user.id)
            )
        no_action_leads = no_action_q.limit(5).all()
        if no_action_leads:
            notifs.append(_notif(
                "leads_no_next_action", "lead_warning", "warning",
                f"Лиды без следующего действия: {len(no_action_leads)}",
                "Назначьте следующее действие",
                link="/leads",
            ))

    # ─── 8. Overdue payments (admin/finance) ─────────────────────
    # Driven by the payment schedule — the old Deal.expected_payment_date could
    # not represent partial payments or multi-instalment deals.
    if _is_finance_admin(user) or _is_sales(user):
        from app.services.deals import overdue_payments
        for p in overdue_payments(db, today_bk)[:10]:
            deal = db.query(Deal).filter(Deal.id == p.deal_id).first()
            if deal is None:
                continue
            outstanding = int(p.planned_amount or 0) - int(p.paid_amount or 0)
            lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
            who = (lead.company_name or lead.client_name) if lead else f"сделка #{deal.id}"
            notifs.append(_notif(
                f"payment_overdue_{p.id}", "payment_overdue", "warning",
                f"Оплата просрочена: {who}",
                f"Ожидалась {p.planned_date.strftime('%d.%m')} · остаток {outstanding:,} сом".replace(",", " "),
                link=f"/leads/{deal.lead_id}" if deal.lead_id else "/leads?view=funnel",
            ))

    # ─── 9. Recent deals — paid or minus (admin/founder) ─────────
    if user.role == Role.admin or user.is_founder:
        since = now_utc - timedelta(days=3)
        recent_paid = (
            db.query(Deal)
            .filter(Deal.status == "paid", Deal.updated_at >= since)
            .order_by(Deal.updated_at.desc()).limit(5).all()
        )
        for d in recent_paid:
            notifs.append(_notif(
                f"deal_paid_{d.id}", "deal_paid", "info",
                f"Оплата получена: сделка #{d.id}",
                f"{d.paid_amount:,} сом",
                link=f"/leads/{d.lead_id}" if d.lead_id else "/leads?view=funnel",
            ))

        recent_minus = (
            db.query(Meeting)
            .filter(Meeting.status == MeetingStatus.minus, Meeting.created_at >= since)
            .order_by(Meeting.created_at.desc()).limit(5).all()
        )
        for m in recent_minus:
            notifs.append(_notif(
                f"meeting_minus_{m.id}", "meeting_minus", "warning",
                f"Встреча ушла в минус: {m.client_name}",
                m.meeting_date.astimezone(_BISHKEK).strftime('%d.%m') if m.meeting_date else "",
                link="/dept/sales/meetings",
            ))

    # ─── 10. Cashflow warning (admin/founder/финдир) ─────────────
    if _is_finance_admin(user):
        try:
            # Latest account balances
            from sqlalchemy import func as sqlfunc
            latest_bals = (
                db.query(AccountBalance)
                .distinct(AccountBalance.account_id)
                .order_by(AccountBalance.account_id, AccountBalance.date.desc())
                .all()
            )
            total_on_accounts = sum(b.balance for b in latest_bals)

            # Monthly expenses (last 30 days) as proxy
            thirty_ago = today_bk - timedelta(days=30)
            monthly_exp = db.query(func.coalesce(func.sum(FinanceTransaction.amount), 0)).filter(
                FinanceTransaction.type == "expense",
                FinanceTransaction.date >= thirty_ago,
            ).scalar() or 0

            forecast_7 = total_on_accounts - int(monthly_exp * 7 / 30)
            if forecast_7 < 0:
                notifs.append(_notif(
                    "cashflow_warning", "cashflow", "critical",
                    "Риск кассового разрыва (7 дней)",
                    f"Прогноз: {forecast_7:,} сом",
                    link="/finance",
                ))
        except Exception:
            pass

    return {"count": len(notifs), "items": notifs}
