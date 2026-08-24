"""Deal amount / payment schedule domain logic.

Single source of truth rules enforced here:

* ``Deal.amount``      — сумма сделки (canonical).
* ``Deal.paid_amount`` — derived: sum of confirmed ``DealPayment.paid_amount``.
* Остаток              — never stored: ``max(amount - paid_amount, 0)``.
* ``Deal.status``      — derived: pending / partial / paid.
* Legacy ``Lead.potential_amount`` / ``Lead.actual_amount`` are mirrored for
  backwards compatibility but are never read as authoritative.

All amounts are whole сом (integers).
"""
from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.models import (
    Deal, DealPayment, DealStatus, FinanceTransaction, Lead, PaymentStatus, Service,
)

# Payments in these states count towards the paid total.
CONFIRMED_STATUSES = (PaymentStatus.paid, PaymentStatus.partial)


# ───────────────────────────── Deal access ─────────────────────────────

def get_deal(db: Session, lead_id: int) -> Deal | None:
    """The lead's current deal (most recent one, if several legacy rows exist)."""
    return (
        db.query(Deal)
        .filter(Deal.lead_id == lead_id)
        .order_by(Deal.created_at.desc(), Deal.id.desc())
        .first()
    )


def ensure_deal(db: Session, lead: Lead, amount: int | None = None) -> Deal:
    """Return the lead's deal, creating it if missing.

    New deals seed their amount from the legacy ``potential_amount`` so nothing
    is lost for leads that predate the deal-centric model.
    """
    deal = get_deal(db, lead.id)
    if deal is None:
        deal = Deal(
            lead_id=lead.id,
            amount=int(amount if amount is not None else (lead.potential_amount or 0)),
            paid_amount=0,
            status=DealStatus.pending.value,
            setter_id=lead.setter_id,
            closer_id=lead.closer_id,
        )
        db.add(deal)
        db.flush()
    elif amount is not None:
        deal.amount = int(amount)
    return deal


# ─────────────────────────── Derived amounts ───────────────────────────

def scheduled_total(db: Session, deal_id: int) -> int:
    """Sum of planned amounts across non-cancelled schedule rows."""
    rows = (
        db.query(DealPayment)
        .filter(DealPayment.deal_id == deal_id, DealPayment.status != PaymentStatus.cancelled)
        .all()
    )
    return sum(int(r.planned_amount or 0) for r in rows)


def paid_total(db: Session, deal_id: int) -> int:
    rows = (
        db.query(DealPayment)
        .filter(DealPayment.deal_id == deal_id, DealPayment.status.in_(CONFIRMED_STATUSES))
        .all()
    )
    return sum(int(r.paid_amount or 0) for r in rows)


def remaining(amount: int, paid: int) -> int:
    return max(int(amount or 0) - int(paid or 0), 0)


def is_overdue(payment: DealPayment, today: date | None = None) -> bool:
    """Server-side overdue rule: past the planned date with money still outstanding.

    Never persisted — recomputed on every read so it cannot go stale.
    """
    if payment.status in (PaymentStatus.paid, PaymentStatus.cancelled):
        return False
    if not payment.planned_date:
        return False
    outstanding = int(payment.planned_amount or 0) - int(payment.paid_amount or 0)
    if outstanding <= 0:
        return False
    return payment.planned_date < (today or date.today())


def payment_display_status(payment: DealPayment, today: date | None = None) -> str:
    """Stored status widened with the derived `overdue` state, for API output."""
    if is_overdue(payment, today):
        return "overdue"
    return payment.status.value if hasattr(payment.status, "value") else str(payment.status)


# ─────────────────────────── Recalculation ─────────────────────────────

def recalc_deal(db: Session, deal: Deal) -> Deal:
    """Recompute paid_amount / status / payment_date from confirmed payments.

    Also mirrors the legacy Lead columns so old readers stay consistent.
    """
    paid = paid_total(db, deal.id)
    deal.paid_amount = paid

    amount = int(deal.amount or 0)
    if paid <= 0:
        deal.status = DealStatus.pending.value
    elif amount > 0 and paid >= amount:
        deal.status = DealStatus.paid.value
    else:
        deal.status = DealStatus.partial.value

    # payment_date = date of the last confirmed payment (used by payroll/finance).
    last = (
        db.query(DealPayment)
        .filter(
            DealPayment.deal_id == deal.id,
            DealPayment.status.in_(CONFIRMED_STATUSES),
            DealPayment.paid_date.isnot(None),
        )
        .order_by(DealPayment.paid_date.desc())
        .first()
    )
    if last:
        deal.payment_date = last.paid_date
        if last.payment_method:
            deal.payment_method = last.payment_method

    deal.updated_at = datetime.now(timezone.utc)

    lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
    if lead:
        # Deprecated mirrors — kept in sync, never shown to users.
        lead.potential_amount = amount
        lead.actual_amount = paid

    db.flush()
    return deal


# ──────────────────────── Finance transaction sync ─────────────────────

def sync_finance_transaction(db: Session, payment: DealPayment, deal: Deal) -> None:
    """Create or update the income transaction backing a confirmed payment.

    Idempotent: the payment owns at most one transaction (``finance_transaction_id``),
    so repeated confirmations update the amount instead of double-counting revenue.
    A payment that drops back to zero / cancelled has its transaction removed.
    """
    confirmed = payment.status in CONFIRMED_STATUSES and int(payment.paid_amount or 0) > 0

    tx: FinanceTransaction | None = None
    if payment.finance_transaction_id:
        tx = db.query(FinanceTransaction).filter(
            FinanceTransaction.id == payment.finance_transaction_id
        ).first()

    if not confirmed:
        if tx is not None:
            db.delete(tx)
        payment.finance_transaction_id = None
        db.flush()
        return

    lead = db.query(Lead).filter(Lead.id == deal.lead_id).first()
    client = ""
    service_name = ""
    if lead:
        client = lead.company_name or lead.client_name
        if lead.service_id:
            svc = db.query(Service).filter(Service.id == lead.service_id).first()
            service_name = f", {svc.name}" if svc else ""
    comment = f"Оплата сделки {client or f'#{deal.id}'}{service_name}"

    tx_date = payment.paid_date or date.today()

    if tx is None:
        tx = FinanceTransaction(
            type="income",
            category=None,
            amount=int(payment.paid_amount),
            date=tx_date,
            related_lead_id=deal.lead_id,
            related_deal_id=deal.id,
            account_id=payment.account_id,
            payment_method=payment.payment_method or deal.payment_method or "",
            comment=comment,
        )
        db.add(tx)
        db.flush()
        payment.finance_transaction_id = tx.id
    else:
        tx.amount = int(payment.paid_amount)
        tx.date = tx_date
        tx.account_id = payment.account_id
        tx.payment_method = payment.payment_method or tx.payment_method
        tx.related_lead_id = deal.lead_id
        tx.related_deal_id = deal.id
    db.flush()


# ─────────────────────────── Schedule guards ───────────────────────────

class ScheduleError(ValueError):
    """Raised when a schedule change would break a deal invariant."""


def assert_schedule_fits(
    db: Session,
    deal: Deal,
    new_planned_amount: int,
    exclude_payment_id: int | None = None,
) -> None:
    """Total of the payment schedule must never exceed the deal amount."""
    rows = (
        db.query(DealPayment)
        .filter(DealPayment.deal_id == deal.id, DealPayment.status != PaymentStatus.cancelled)
        .all()
    )
    other = sum(
        int(r.planned_amount or 0) for r in rows if r.id != exclude_payment_id
    )
    if other + int(new_planned_amount) > int(deal.amount or 0):
        free = max(int(deal.amount or 0) - other, 0)
        raise ScheduleError(
            f"Сумма графика превышает сумму сделки. Не распределено: {free:,} сом".replace(",", " ")
        )


def unscheduled_amount(db: Session, deal: Deal) -> int:
    """How much of the deal amount is not covered by the schedule yet."""
    return max(int(deal.amount or 0) - scheduled_total(db, deal.id), 0)


def assert_amount_covers_schedule(db: Session, deal: Deal, new_amount: int) -> None:
    """Lowering the deal amount below the already-planned total is rejected."""
    planned = scheduled_total(db, deal.id)
    if planned > int(new_amount):
        raise ScheduleError(
            f"Сумма сделки меньше запланированных платежей ({planned:,} сом). "
            "Сначала измените график оплат.".replace(",", " ")
        )


# ──────────────────────────── Confirmation ─────────────────────────────

def confirm_payment(
    db: Session,
    payment: DealPayment,
    amount: int,
    paid_date: date | None,
    user_id: int | None,
    payment_method: str | None = None,
    account_id: int | None = None,
    comment: str | None = None,
) -> DealPayment:
    """Record an actually-received amount against a scheduled payment.

    Partial payments are first-class: the row stays ``partial`` until the full
    planned amount is covered.
    """
    amount = int(amount)
    if amount < 0:
        raise ScheduleError("Сумма оплаты не может быть отрицательной")

    deal = db.query(Deal).filter(Deal.id == payment.deal_id).first()
    if deal is None:
        raise ScheduleError("Сделка не найдена")

    if amount > int(payment.planned_amount or 0):
        raise ScheduleError("Оплата больше планового платежа")

    # Guard the deal-level invariant too: other payments may already cover the rest.
    other_paid = paid_total(db, deal.id) - (
        int(payment.paid_amount or 0) if payment.status in CONFIRMED_STATUSES else 0
    )
    if other_paid + amount > int(deal.amount or 0):
        raise ScheduleError("Суммарная оплата превышает сумму сделки")

    payment.paid_amount = amount
    payment.paid_date = paid_date or date.today()
    if payment_method is not None:
        payment.payment_method = payment_method
    if account_id is not None:
        payment.account_id = account_id
    if comment is not None:
        payment.comment = comment
    payment.updated_by = user_id
    payment.updated_at = datetime.now(timezone.utc)

    if amount <= 0:
        payment.status = PaymentStatus.planned
        payment.paid_date = None
    elif amount >= int(payment.planned_amount or 0):
        payment.status = PaymentStatus.paid
    else:
        payment.status = PaymentStatus.partial

    db.flush()
    sync_finance_transaction(db, payment, deal)
    recalc_deal(db, deal)
    return payment


def deal_is_fully_paid(db: Session, deal: Deal) -> bool:
    amount = int(deal.amount or 0)
    return amount > 0 and paid_total(db, deal.id) >= amount


def overdue_payments(db: Session, today: date | None = None) -> list[DealPayment]:
    """All schedule rows past their planned date with money outstanding."""
    today = today or date.today()
    rows = (
        db.query(DealPayment)
        .filter(
            DealPayment.status.notin_([PaymentStatus.paid, PaymentStatus.cancelled]),
            DealPayment.planned_date < today,
        )
        .all()
    )
    return [r for r in rows if is_overdue(r, today)]
