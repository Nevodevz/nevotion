from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.core.deps import get_db, get_current_user
from app.models import (
    FinanceTransaction, Debt, AccountBalance, Account, User, ExpenseCategory, AdExpense,
)

router = APIRouter(prefix="/api/finance", tags=["finance"])


# ─── Helpers ────────────────────────────────────────────────────

def _parse_date(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val[:10])
    except Exception:
        return None


def _is_finance_admin(user: User) -> bool:
    return user.role == "admin" or user.is_founder or user.position == "Финансовый директор"


def _tx_dict(t: FinanceTransaction) -> dict:
    return {
        "id": t.id,
        "type": t.type,
        "category": t.category,
        "amount": t.amount,
        "date": t.date.isoformat() if t.date else None,
        "related_lead_id": t.related_lead_id,
        "related_deal_id": t.related_deal_id,
        "account_id": t.account_id,
        "responsible_id": t.responsible_id,
        "payment_method": t.payment_method,
        "comment": t.comment,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "responsible": {"id": t.responsible.id, "name": t.responsible.name} if t.responsible else None,
    }


def _debt_dict(d: Debt) -> dict:
    return {
        "id": d.id,
        "counterparty": d.counterparty,
        "direction": d.direction,
        "amount": d.amount,
        "created_date": d.created_date.isoformat() if d.created_date else None,
        "due_date": d.due_date.isoformat() if d.due_date else None,
        "status": d.status,
        "comment": d.comment,
        "created_at": d.created_at.isoformat() if d.created_at else None,
    }


def _ab_dict(b: AccountBalance) -> dict:
    return {
        "id": b.id,
        "account_id": b.account_id,
        "date": b.date.isoformat() if b.date else None,
        "balance": b.balance,
        "comment": b.comment,
        "created_at": b.created_at.isoformat() if b.created_at else None,
        "account": {"id": b.account.id, "name": b.account.name} if b.account else None,
    }


# ─── Transactions ───────────────────────────────────────────────

class TransactionIn(BaseModel):
    type: str
    category: Optional[str] = None
    amount: int
    date: str
    account_id: Optional[int] = None
    responsible_id: Optional[int] = None
    payment_method: str = ""
    comment: str = ""
    related_lead_id: Optional[int] = None
    related_deal_id: Optional[int] = None


@router.get("/transactions")
def list_transactions(
    type: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    account_id: Optional[int] = None,
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    q = db.query(FinanceTransaction)
    if type:
        q = q.filter(FinanceTransaction.type == type)
    if category:
        q = q.filter(FinanceTransaction.category == category)
    if date_from:
        q = q.filter(FinanceTransaction.date >= _parse_date(date_from))
    if date_to:
        q = q.filter(FinanceTransaction.date <= _parse_date(date_to))
    if account_id:
        q = q.filter(FinanceTransaction.account_id == account_id)
    total = q.count()
    items = q.order_by(FinanceTransaction.date.desc()).offset(skip).limit(limit).all()
    return {"items": [_tx_dict(t) for t in items], "total": total}


@router.post("/transactions")
def create_transaction(
    body: TransactionIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    tx = FinanceTransaction(
        type=body.type,
        category=body.category,
        amount=body.amount,
        date=_parse_date(body.date) or date.today(),
        account_id=body.account_id,
        responsible_id=body.responsible_id,
        payment_method=body.payment_method,
        comment=body.comment,
        related_lead_id=body.related_lead_id,
        related_deal_id=body.related_deal_id,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return _tx_dict(tx)


@router.put("/transactions/{tx_id}")
def update_transaction(
    tx_id: int,
    body: TransactionIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404, "Не найдено")
    tx.type = body.type
    tx.category = body.category
    tx.amount = body.amount
    tx.date = _parse_date(body.date) or tx.date
    tx.account_id = body.account_id
    tx.responsible_id = body.responsible_id
    tx.payment_method = body.payment_method
    tx.comment = body.comment
    db.commit()
    db.refresh(tx)
    return _tx_dict(tx)


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(
    tx_id: int,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    tx = db.query(FinanceTransaction).filter(FinanceTransaction.id == tx_id).first()
    if not tx:
        raise HTTPException(404)
    db.delete(tx)
    db.commit()


# ─── Debts ──────────────────────────────────────────────────────

class DebtIn(BaseModel):
    counterparty: str
    direction: str
    amount: int
    created_date: str
    due_date: Optional[str] = None
    status: str = "active"
    comment: str = ""


@router.get("/debts")
def list_debts(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    items = db.query(Debt).order_by(Debt.created_date.desc()).all()
    return [_debt_dict(d) for d in items]


@router.post("/debts")
def create_debt(body: DebtIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    debt = Debt(
        counterparty=body.counterparty,
        direction=body.direction,
        amount=body.amount,
        created_date=_parse_date(body.created_date) or date.today(),
        due_date=_parse_date(body.due_date),
        status=body.status,
        comment=body.comment,
    )
    db.add(debt)
    db.commit()
    db.refresh(debt)
    return _debt_dict(debt)


@router.put("/debts/{debt_id}")
def update_debt(
    debt_id: int,
    body: DebtIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    debt = db.query(Debt).filter(Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(404)
    debt.counterparty = body.counterparty
    debt.direction = body.direction
    debt.amount = body.amount
    debt.created_date = _parse_date(body.created_date) or debt.created_date
    debt.due_date = _parse_date(body.due_date)
    debt.status = body.status
    debt.comment = body.comment
    db.commit()
    db.refresh(debt)
    return _debt_dict(debt)


@router.delete("/debts/{debt_id}", status_code=204)
def delete_debt(debt_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    debt = db.query(Debt).filter(Debt.id == debt_id).first()
    if not debt:
        raise HTTPException(404)
    db.delete(debt)
    db.commit()


# ─── Account Balances ───────────────────────────────────────────

class BalanceIn(BaseModel):
    account_id: int
    date: str
    balance: int
    comment: str = ""


@router.get("/balances")
def list_balances(db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    items = db.query(AccountBalance).order_by(AccountBalance.date.desc()).all()
    return [_ab_dict(b) for b in items]


@router.post("/balances")
def create_balance(body: BalanceIn, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    b = AccountBalance(
        account_id=body.account_id,
        date=_parse_date(body.date) or date.today(),
        balance=body.balance,
        comment=body.comment,
    )
    db.add(b)
    db.commit()
    db.refresh(b)
    return _ab_dict(b)


@router.put("/balances/{bal_id}")
def update_balance(
    bal_id: int,
    body: BalanceIn,
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    b = db.query(AccountBalance).filter(AccountBalance.id == bal_id).first()
    if not b:
        raise HTTPException(404)
    b.account_id = body.account_id
    b.date = _parse_date(body.date) or b.date
    b.balance = body.balance
    b.comment = body.comment
    db.commit()
    db.refresh(b)
    return _ab_dict(b)


@router.delete("/balances/{bal_id}", status_code=204)
def delete_balance(bal_id: int, db: Session = Depends(get_db), me: User = Depends(get_current_user)):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    b = db.query(AccountBalance).filter(AccountBalance.id == bal_id).first()
    if not b:
        raise HTTPException(404)
    db.delete(b)
    db.commit()


# ─── Summary ────────────────────────────────────────────────────

@router.get("/summary")
def get_summary(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    me: User = Depends(get_current_user),
):
    if not _is_finance_admin(me):
        raise HTTPException(403, "Нет доступа")
    d_from = _parse_date(date_from)
    d_to = _parse_date(date_to)

    q = db.query(FinanceTransaction)
    if d_from:
        q = q.filter(FinanceTransaction.date >= d_from)
    if d_to:
        q = q.filter(FinanceTransaction.date <= d_to)

    all_tx = q.all()

    income = sum(t.amount for t in all_tx if t.type == "income")
    expenses = sum(t.amount for t in all_tx if t.type == "expense")
    fot = sum(t.amount for t in all_tx if t.type == "expense" and t.category in ("ФОТ", "Бонусы"))
    returns = sum(t.amount for t in all_tx if t.type == "expense" and t.category == "Возвраты клиентам")

    # Marketing expenses come from AdExpense table (not FinanceTransaction) to avoid double-counting
    ae_q = db.query(AdExpense)
    if d_from:
        ae_q = ae_q.filter(AdExpense.date >= d_from)
    if d_to:
        ae_q = ae_q.filter(AdExpense.date <= d_to)
    marketing_exp = sum(e.amount for e in ae_q.all())
    profit = income - expenses

    active_debts = db.query(Debt).filter(Debt.status.in_(["active", "partial", "overdue"])).all()
    we_owe = sum(d.amount for d in active_debts if d.direction == "we_owe")
    owed_to_us = sum(d.amount for d in active_debts if d.direction == "owed_to_us")

    # Latest balance per account
    balances_subq = (
        db.query(AccountBalance.account_id, func.max(AccountBalance.date).label("max_date"))
        .group_by(AccountBalance.account_id)
        .subquery()
    )
    latest_balances = (
        db.query(AccountBalance)
        .join(balances_subq, (AccountBalance.account_id == balances_subq.c.account_id) &
              (AccountBalance.date == balances_subq.c.max_date))
        .all()
    )
    total_on_accounts = sum(b.balance for b in latest_balances)

    # Forecast: plan income = outstanding scheduled payments due in the next 30 days
    from app.models import DealPayment
    from datetime import timedelta
    today = date.today()
    plan_income = db.query(
        func.coalesce(func.sum(DealPayment.planned_amount - DealPayment.paid_amount), 0)
    ).filter(
        DealPayment.status.notin_(["paid", "cancelled"]),
        DealPayment.planned_date >= today,
        DealPayment.planned_date <= today + timedelta(days=30),
    ).scalar() or 0
    plan_income = max(int(plan_income), 0)

    # Monthly average expenses as rough forecast
    avg_monthly_expenses = expenses  # within queried period as proxy

    forecast_7 = total_on_accounts - int(avg_monthly_expenses * 7 / 30)
    forecast_14 = total_on_accounts - int(avg_monthly_expenses * 14 / 30)
    forecast_30 = total_on_accounts + plan_income - avg_monthly_expenses

    return {
        "income": income,
        "expenses": expenses,
        "profit": profit,
        "fot": fot,
        "marketing_expenses": marketing_exp,
        "returns": returns,
        "we_owe": we_owe,
        "owed_to_us": owed_to_us,
        "total_on_accounts": total_on_accounts,
        "plan_income_30d": plan_income,
        "account_balances": [_ab_dict(b) for b in latest_balances],
        "cashflow_forecast": {
            "days_7": forecast_7,
            "days_14": forecast_14,
            "days_30": forecast_30,
            "warning_7": forecast_7 < 0,
            "warning_14": forecast_14 < 0,
            "warning_30": forecast_30 < 0,
        },
    }
