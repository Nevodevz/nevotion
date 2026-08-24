from datetime import datetime, date, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Lead, LeadStageHistory, LeadActivity, LeadStage, Meeting, Deal, DealPayment,
    PaymentStatus,
)
from app.services import deals as deal_service


def create_lead_activity(
    db: Session,
    lead_id: int,
    activity_type: str,
    channel: str = "",
    description: str = "",
    responsible_id: int | None = None,
) -> LeadActivity:
    activity = LeadActivity(
        lead_id=lead_id,
        activity_type=activity_type,
        channel=channel,
        description=description,
        responsible_id=responsible_id,
    )
    db.add(activity)
    db.flush()
    return activity


def _parse_date(val: str | None) -> date | None:
    if not val:
        return None
    try:
        return date.fromisoformat(val[:10])
    except Exception:
        return None


def _stage_kind(stage: LeadStage) -> str:
    name = stage.name.lower()
    if stage.is_lost or "минус" in name:
        return "lost"
    if stage.is_won or "оплач" in name:
        return "won"
    if "встреч" in name:
        return "meeting"
    if "договор" in name:
        return "contract"
    if "ожидани" in name or "ожид" in name:
        return "waiting_payment"
    return "generic"


def active_stages(db: Session) -> list[LeadStage]:
    """Stages usable in forms, funnel and stage pickers (archived ones excluded)."""
    return (
        db.query(LeadStage)
        .filter(LeadStage.is_archived == False)  # noqa: E712 — SQL expression
        .order_by(LeadStage.position)
        .all()
    )


class StageTransitionError(ValueError):
    """A stage change was rejected by domain rules (surfaced as HTTP 422)."""


def change_lead_stage(
    db: Session,
    lead: Lead,
    to_stage_id: int | None,
    changed_by: int | None = None,
    comment: str = "",
    extra_data: dict | None = None,
) -> LeadStageHistory:
    extra_data = extra_data or {}

    stage = db.query(LeadStage).filter(LeadStage.id == to_stage_id).first() if to_stage_id else None
    if stage is not None and stage.is_archived:
        raise StageTransitionError("Этап архивирован и недоступен для выбора")

    kind = _stage_kind(stage) if stage else "generic"

    # Side effects run BEFORE the stage is moved so a handler can veto the move.
    # `won` in particular must not close a deal that is only partially paid.
    if kind == "meeting":
        _handle_meeting_stage(db, lead, changed_by, extra_data)
    elif kind == "contract":
        _handle_contract_stage(db, lead, changed_by, extra_data)
    elif kind == "waiting_payment":
        _handle_waiting_payment_stage(db, lead, changed_by, extra_data)
    elif kind == "won":
        _handle_won_stage(db, lead, changed_by, extra_data)
    elif kind == "lost":
        _handle_lost_stage(db, lead, changed_by, extra_data)

    entry = LeadStageHistory(
        lead_id=lead.id,
        from_stage_id=lead.stage_id,
        to_stage_id=to_stage_id,
        changed_by=changed_by,
        comment=comment,
    )
    db.add(entry)
    lead.stage_id = to_stage_id
    lead.updated_at = datetime.now(timezone.utc)

    create_lead_activity(
        db,
        lead_id=lead.id,
        activity_type="stage_change",
        description="Этап изменён",
        responsible_id=changed_by,
    )
    db.flush()
    return entry


def _handle_meeting_stage(db: Session, lead: Lead, changed_by: int | None, extra: dict) -> None:
    meeting_date_str = extra.get("meeting_date") or extra.get("date")
    meeting_time_str = extra.get("meeting_time") or extra.get("time", "00:00")
    address = extra.get("address", "")
    # «Комментарий» — canonical storage is Meeting.notes.
    notes = extra.get("comment") or extra.get("notes") or ""
    closer_id = extra.get("closer_id") or lead.closer_id
    setter_id = extra.get("setter_id") or lead.setter_id

    if meeting_date_str:
        try:
            dt_str = f"{meeting_date_str[:10]}T{meeting_time_str or '00:00'}:00"
            meeting_dt = datetime.fromisoformat(dt_str).replace(tzinfo=timezone.utc)
        except Exception:
            meeting_dt = datetime.now(timezone.utc)
    else:
        meeting_dt = datetime.now(timezone.utc)

    try:
        duration = int(extra.get("duration_minutes") or 60)
    except (TypeError, ValueError):
        duration = 60

    m = Meeting(
        lead_id=lead.id,
        client_name=lead.client_name,
        client_phone=lead.phone,
        meeting_date=meeting_dt,
        address=address,
        notes=notes,
        duration_minutes=max(5, min(duration, 24 * 60)),
        closer_id=closer_id,
        setter_id=setter_id,
    )
    db.add(m)
    db.flush()


def _handle_contract_stage(db: Session, lead: Lead, changed_by: int | None, extra: dict) -> None:
    amount = extra.get("amount")
    contract_sent_at = _parse_date(extra.get("contract_sent_at"))
    expected_payment_date = _parse_date(extra.get("expected_payment_date"))
    responsible_id = extra.get("responsible_id") or changed_by

    deal = deal_service.ensure_deal(db, lead)
    if amount is not None and int(amount) > 0:
        deal_service.assert_amount_covers_schedule(db, deal, int(amount))
        deal.amount = int(amount)
    if contract_sent_at:
        deal.contract_sent_at = contract_sent_at
    if expected_payment_date:
        deal.expected_payment_date = expected_payment_date
    if responsible_id:
        deal.responsible_id = responsible_id
    deal.updated_at = datetime.now(timezone.utc)

    _seed_default_schedule(db, deal, expected_payment_date, changed_by)
    deal_service.recalc_deal(db, deal)


def _handle_waiting_payment_stage(db: Session, lead: Lead, changed_by: int | None, extra: dict) -> None:
    amount = extra.get("amount")
    expected_payment_date = _parse_date(extra.get("expected_payment_date"))
    responsible_id = extra.get("responsible_id") or changed_by

    deal = deal_service.ensure_deal(db, lead)
    if amount is not None and int(amount) > 0:
        deal_service.assert_amount_covers_schedule(db, deal, int(amount))
        deal.amount = int(amount)
    if expected_payment_date:
        deal.expected_payment_date = expected_payment_date
    if responsible_id:
        deal.responsible_id = responsible_id
    deal.updated_at = datetime.now(timezone.utc)

    _seed_default_schedule(db, deal, expected_payment_date, changed_by)
    deal_service.recalc_deal(db, deal)


def _seed_default_schedule(
    db: Session, deal: Deal, due: date | None, user_id: int | None
) -> None:
    """Give a brand-new deal one full-amount planned payment.

    Only runs when the schedule is empty, so a manually built schedule is never
    overwritten.
    """
    if int(deal.amount or 0) <= 0:
        return
    existing = db.query(DealPayment).filter(DealPayment.deal_id == deal.id).count()
    if existing:
        return
    db.add(DealPayment(
        deal_id=deal.id,
        planned_date=due or deal.expected_payment_date or date.today(),
        planned_amount=int(deal.amount),
        paid_amount=0,
        status=PaymentStatus.planned,
        created_by=user_id,
        comment="Создан автоматически при переходе этапа",
    ))
    db.flush()


def _handle_won_stage(db: Session, lead: Lead, changed_by: int | None, extra: dict) -> None:
    """Record a payment and only then allow the lead into the fully-paid stage.

    A partial payment is stored (money is never lost) but the transition is
    rejected, so the lead stays where it is instead of looking closed.
    """
    paid_amount = int(extra.get("paid_amount") or extra.get("amount") or 0)
    payment_date = _parse_date(extra.get("payment_date")) or date.today()
    payment_method = extra.get("payment_method", "")
    account_id = extra.get("account_id") or None
    setter_id = extra.get("setter_id") or lead.setter_id
    closer_id = extra.get("closer_id") or lead.closer_id
    deal_type = extra.get("deal_type", "")

    deal = deal_service.ensure_deal(db, lead)
    if int(deal.amount or 0) <= 0 and paid_amount > 0:
        deal.amount = paid_amount
    if setter_id:
        deal.setter_id = setter_id
    if closer_id:
        deal.closer_id = closer_id
    if deal_type:
        deal.deal_type = deal_type
    db.flush()

    if paid_amount > 0:
        _apply_payment_across_schedule(
            db, deal, paid_amount, payment_date, changed_by,
            payment_method=payment_method, account_id=account_id,
        )

    deal_service.recalc_deal(db, deal)

    if not deal_service.deal_is_fully_paid(db, deal):
        paid = int(deal.paid_amount or 0)
        left = deal_service.remaining(int(deal.amount or 0), paid)
        raise StageTransitionError(
            f"Оплата зафиксирована ({paid:,} сом), но сделка оплачена не полностью. "
            f"Остаток: {left:,} сом. Этап «Оплачено» будет доступен после полной оплаты.".replace(",", " ")
        )

    from app.services.payments import on_deal_paid
    on_deal_paid(db, deal)


def _apply_payment_across_schedule(
    db: Session,
    deal: Deal,
    amount: int,
    when: date,
    user_id: int | None,
    payment_method: str = "",
    account_id: int | None = None,
) -> None:
    """Distribute a received amount over the open schedule rows, oldest first.

    If the schedule has no room left (or does not exist), an extra row is created
    so the money is still tracked against the deal.
    """
    left = int(amount)
    rows = (
        db.query(DealPayment)
        .filter(
            DealPayment.deal_id == deal.id,
            DealPayment.status.notin_([PaymentStatus.paid, PaymentStatus.cancelled]),
        )
        .order_by(DealPayment.planned_date, DealPayment.id)
        .all()
    )
    for row in rows:
        if left <= 0:
            break
        capacity = int(row.planned_amount or 0) - int(row.paid_amount or 0)
        if capacity <= 0:
            continue
        take = min(capacity, left)
        deal_service.confirm_payment(
            db, row,
            amount=int(row.paid_amount or 0) + take,
            paid_date=when,
            user_id=user_id,
            payment_method=payment_method or None,
            account_id=account_id,
        )
        left -= take

    if left > 0:
        extra_row = DealPayment(
            deal_id=deal.id,
            planned_date=when,
            planned_amount=left,
            paid_amount=0,
            status=PaymentStatus.planned,
            payment_method=payment_method,
            account_id=account_id,
            created_by=user_id,
            comment="Оплата вне графика",
        )
        db.add(extra_row)
        db.flush()
        deal_service.confirm_payment(
            db, extra_row, amount=left, paid_date=when, user_id=user_id,
            payment_method=payment_method or None, account_id=account_id,
        )


def _handle_lost_stage(db: Session, lead: Lead, changed_by: int | None, extra: dict) -> None:
    reject_reason_id = extra.get("reject_reason_id")
    reject_comment = extra.get("reject_comment", "")
    closer_id = extra.get("closer_id") or lead.closer_id

    if reject_reason_id:
        lead.reject_reason_id = reject_reason_id
    if reject_comment:
        lead.reject_comment = reject_comment
    if closer_id:
        lead.closer_id = closer_id
    db.flush()


def add_activity(
    db: Session,
    lead: Lead,
    activity_type: str,
    channel: str = "",
    description: str = "",
    responsible_id: int | None = None,
) -> LeadActivity:
    return create_lead_activity(
        db,
        lead_id=lead.id,
        activity_type=activity_type,
        channel=channel,
        description=description,
        responsible_id=responsible_id,
    )


def get_lead_timeline(db: Session, lead: Lead) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []

    events.append({
        "type": "created",
        "label": "Лид создан",
        "description": f"Клиент: {lead.client_name}",
        "at": lead.created_at.isoformat() if lead.created_at else None,
        "icon": "person_add",
    })

    history = (
        db.query(LeadStageHistory)
        .filter(LeadStageHistory.lead_id == lead.id)
        .order_by(LeadStageHistory.created_at)
        .all()
    )
    from app.models import User
    # Include archived stages here on purpose — old history must stay readable.
    stages = {s.id: s.name for s in db.query(LeadStage).all()}
    users = {u.id: u.name for u in db.query(User).filter(User.id.in_([h.changed_by for h in history if h.changed_by])).all()}

    for h in history:
        from_name = stages.get(h.from_stage_id, "—") if h.from_stage_id else "—"
        to_name = stages.get(h.to_stage_id, "—") if h.to_stage_id else "—"
        by_name = users.get(h.changed_by, "") if h.changed_by else ""
        events.append({
            "type": "stage_change",
            "label": f"Этап: {from_name} → {to_name}",
            "description": h.comment or (f"Изменил: {by_name}" if by_name else ""),
            "at": h.created_at.isoformat() if h.created_at else None,
            "icon": "swap_horiz",
            "by": by_name,
        })

    payments = (
        db.query(DealPayment)
        .join(Deal, Deal.id == DealPayment.deal_id)
        .filter(Deal.lead_id == lead.id, DealPayment.status.in_(deal_service.CONFIRMED_STATUSES))
        .order_by(DealPayment.paid_date)
        .all()
    )
    for p in payments:
        events.append({
            "type": "payment",
            "label": f"Оплата: {int(p.paid_amount or 0):,} сом".replace(",", " "),
            "description": p.payment_method or p.comment or "",
            "at": (
                datetime.combine(p.paid_date, datetime.min.time(), tzinfo=timezone.utc).isoformat()
                if p.paid_date else None
            ),
            "icon": "payments",
        })

    events.sort(key=lambda e: e.get("at") or "")
    return events
