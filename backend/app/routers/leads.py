from datetime import datetime, date, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import func, and_
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import (
    Lead, LeadStageHistory, LeadActivity, LeadFile,
    LeadSource, Service, LeadStage, Meeting, Task,
    User, Role, LeadStatus, Deal, DealPayment, RejectReason, PaymentStatus,
)
from app.schemas import UserOut
from app.services import deals as deal_service
from app.services.leads import (
    change_lead_stage, add_activity, get_lead_timeline, StageTransitionError, active_stages,
)

router = APIRouter(prefix="/api/leads", tags=["leads"])


# ─────────────────────────── Schemas ────────────────────────────

class LeadSourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; name: str; is_active: bool; position: int


class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; name: str; is_active: bool; position: int


class LeadStageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int; name: str; position: int; norm_days: Optional[int]; is_won: bool; is_lost: bool
    color: str; is_archived: bool = False


class LeadActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    activity_type: str
    channel: str
    description: str
    responsible_id: Optional[int]
    responsible: Optional[UserOut] = None
    created_at: datetime


class LeadStageHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    from_stage_id: Optional[int]
    to_stage_id: Optional[int]
    changed_by: Optional[int]
    comment: str
    created_at: datetime


class LeadFileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    name: str
    url: str
    file_type: str
    uploaded_by: Optional[int]
    uploader: Optional[UserOut] = None
    created_at: datetime


class MeetingBriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    meeting_date: datetime
    client_name: str
    status: str
    closer: Optional[UserOut] = None
    setter: Optional[UserOut] = None


class TaskBriefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str
    priority: str
    due_date: Optional[date]
    completed_at: Optional[date]
    owner: Optional[UserOut] = None


class DealPaymentOut(BaseModel):
    """One row of the payment schedule.

    `status` is the *display* status: the stored value widened with the derived
    `overdue` state, which the server computes from planned_date + outstanding.
    """
    id: int
    deal_id: int
    planned_date: date
    planned_amount: int
    paid_amount: int
    paid_date: Optional[date]
    status: str
    is_overdue: bool
    payment_method: str
    account_id: Optional[int]
    comment: str
    finance_transaction_id: Optional[int]
    created_by: Optional[int]
    updated_by: Optional[int]
    author: Optional[UserOut] = None
    editor: Optional[UserOut] = None
    created_at: datetime
    updated_at: datetime


def _payment_out(p: DealPayment) -> DealPaymentOut:
    return DealPaymentOut(
        id=p.id,
        deal_id=p.deal_id,
        planned_date=p.planned_date,
        planned_amount=int(p.planned_amount or 0),
        paid_amount=int(p.paid_amount or 0),
        paid_date=p.paid_date,
        status=deal_service.payment_display_status(p),
        is_overdue=deal_service.is_overdue(p),
        payment_method=p.payment_method or "",
        account_id=p.account_id,
        comment=p.comment or "",
        finance_transaction_id=p.finance_transaction_id,
        created_by=p.created_by,
        updated_by=p.updated_by,
        author=p.author,
        editor=p.editor,
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


class DealOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    lead_id: int
    amount: int
    paid_amount: int
    payment_date: Optional[date]
    payment_method: str
    status: str
    setter_id: Optional[int]
    closer_id: Optional[int]
    deal_type: str
    contract_sent_at: Optional[date]
    expected_payment_date: Optional[date]
    responsible_id: Optional[int]
    setter_commission: int = 0
    closer_commission: int = 0
    created_at: datetime
    updated_at: datetime
    # Derived — never stored.
    remaining_amount: int = 0
    scheduled_amount: int = 0
    unscheduled_amount: int = 0


def _deal_out(db: Session, deal: Deal | None) -> Optional[DealOut]:
    if deal is None:
        return None
    out = DealOut.model_validate(deal)
    scheduled = deal_service.scheduled_total(db, deal.id)
    out.remaining_amount = deal_service.remaining(deal.amount, deal.paid_amount)
    out.scheduled_amount = scheduled
    out.unscheduled_amount = max(int(deal.amount or 0) - scheduled, 0)
    return out


class LeadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_name: str
    company_name: str
    phone: str
    whatsapp: str
    instagram: str
    email: str
    address: str
    website: str
    industry: str
    employees_count: Optional[int]
    source_id: Optional[int]
    service_id: Optional[int]
    stage_id: Optional[int]
    setter_id: Optional[int]
    closer_id: Optional[int]
    # DEPRECATED mirrors of Deal.amount / confirmed payments — kept for legacy
    # API clients only. The UI reads deal_amount / paid_amount / remaining_amount.
    potential_amount: int
    actual_amount: int
    status: LeadStatus
    next_action_type: str
    next_action_at: Optional[datetime]
    comment: str
    reject_reason_id: Optional[int] = None
    reject_comment: str = ""
    # Attribution
    source_detail: str = ""
    content_ref: str = ""
    utm_source: str = ""
    utm_medium: str = ""
    utm_campaign: str = ""
    utm_content: str = ""
    external_lead_id: str = ""
    created_at: datetime
    updated_at: datetime
    source: Optional[LeadSourceOut] = None
    service: Optional[ServiceOut] = None
    stage: Optional[LeadStageOut] = None
    setter: Optional[UserOut] = None
    closer: Optional[UserOut] = None
    active_deal: Optional[DealOut] = None
    # Canonical money view, derived from the deal + its confirmed payments.
    deal_amount: int = 0
    paid_amount: int = 0
    remaining_amount: int = 0
    deal_status: str = "pending"


class LeadDetailOut(LeadOut):
    stage_history: list[LeadStageHistoryOut] = []
    activities: list[LeadActivityOut] = []
    meetings: list[MeetingBriefOut] = []
    tasks: list[TaskBriefOut] = []
    files: list[LeadFileOut] = []
    timeline: list[dict] = []
    payments: list[DealPaymentOut] = []


class LeadCreate(BaseModel):
    client_name: str
    company_name: str = ""
    phone: str = ""
    whatsapp: str = ""
    instagram: str = ""
    email: str = ""
    address: str = ""
    website: str = ""
    industry: str = ""
    employees_count: Optional[int] = None
    source_id: Optional[int] = None
    service_id: Optional[int] = None
    stage_id: Optional[int] = None
    setter_id: Optional[int] = None
    closer_id: Optional[int] = None
    # Сумма сделки — written straight to Deal.amount.
    deal_amount: int = 0
    comment: str = ""
    next_action_type: str = ""
    next_action_at: Optional[datetime] = None
    source_detail: str = ""
    content_ref: str = ""
    utm_source: str = ""
    utm_medium: str = ""
    utm_campaign: str = ""
    utm_content: str = ""
    external_lead_id: str = ""
    force: bool = False


class LeadUpdate(BaseModel):
    client_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    whatsapp: Optional[str] = None
    instagram: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    website: Optional[str] = None
    industry: Optional[str] = None
    employees_count: Optional[int] = None
    source_id: Optional[int] = None
    service_id: Optional[int] = None
    stage_id: Optional[int] = None
    setter_id: Optional[int] = None
    closer_id: Optional[int] = None
    # Сумма сделки — routed to Deal.amount, not stored on the lead.
    deal_amount: Optional[int] = None
    status: Optional[LeadStatus] = None
    next_action_type: Optional[str] = None
    next_action_at: Optional[datetime] = None
    comment: Optional[str] = None
    source_detail: Optional[str] = None
    content_ref: Optional[str] = None
    utm_source: Optional[str] = None
    utm_medium: Optional[str] = None
    utm_campaign: Optional[str] = None
    utm_content: Optional[str] = None
    external_lead_id: Optional[str] = None


class StageChangeIn(BaseModel):
    to_stage_id: int
    comment: str = ""
    extra_data: dict = {}


class ActivityCreate(BaseModel):
    activity_type: str
    channel: str = ""
    description: str = ""
    responsible_id: Optional[int] = None


class FileCreate(BaseModel):
    name: str
    url: str
    file_type: str = ""


class LeadListResponse(BaseModel):
    items: list[LeadOut]
    total: int


class LeadStats(BaseModel):
    leads_today: int
    leads_period: int
    meetings_period: int
    closed_won: int
    conversion_pct: float
    # Сумма открытых сделок (не выигранных и не проигранных)
    deals_sum: int
    paid_sum: int
    remaining_sum: int
    cpl: Optional[float] = None


class FunnelStats(BaseModel):
    new_leads: int
    meetings_stage: int
    contracts_sent: int
    waiting_payment: int
    closed_won: int
    conversion_pct: float
    deals_sum: int
    paid_sum: int
    remaining_sum: int


class FunnelCardOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    client_name: str
    company_name: str
    stage_id: Optional[int]
    source_id: Optional[int]
    service_id: Optional[int]
    setter_id: Optional[int]
    closer_id: Optional[int]
    next_action_type: str
    next_action_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    source: Optional[LeadSourceOut] = None
    service: Optional[ServiceOut] = None
    stage: Optional[LeadStageOut] = None
    setter: Optional[UserOut] = None
    closer: Optional[UserOut] = None
    days_in_stage: int = 0
    active_deal: Optional[DealOut] = None
    deal_amount: int = 0
    paid_amount: int = 0
    remaining_amount: int = 0
    deal_status: str = "pending"


class FunnelResponse(BaseModel):
    leads: list[FunnelCardOut]
    stages: list[LeadStageOut]


# ─────────────────────────── Helpers ────────────────────────────

def _load_lead(db: Session, lead_id: int) -> Lead:
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(404, "Лид не найден")
    return lead


def _eager_lead(db: Session):
    return db.query(Lead).options(
        joinedload(Lead.source),
        joinedload(Lead.service),
        joinedload(Lead.stage),
        joinedload(Lead.setter),
        joinedload(Lead.closer),
    )


def _lead_to_dict(lead: Lead) -> dict:
    return {c.key: getattr(lead, c.key) for c in lead.__table__.columns}


def _deals_by_lead(db: Session, lead_ids: list[int]) -> dict[int, Deal]:
    """Most recent deal per lead, in a single query (avoids N+1 on lists)."""
    if not lead_ids:
        return {}
    rows = (
        db.query(Deal)
        .filter(Deal.lead_id.in_(lead_ids))
        .order_by(Deal.lead_id, Deal.created_at.desc(), Deal.id.desc())
        .all()
    )
    out: dict[int, Deal] = {}
    for d in rows:
        out.setdefault(d.lead_id, d)
    return out


def _money_fields(db: Session, deal: Deal | None) -> dict:
    """Canonical money view for a lead: сумма сделки / оплачено / остаток."""
    if deal is None:
        return {
            "active_deal": None, "deal_amount": 0, "paid_amount": 0,
            "remaining_amount": 0, "deal_status": "pending",
        }
    amount = int(deal.amount or 0)
    paid = int(deal.paid_amount or 0)
    return {
        "active_deal": _deal_out(db, deal),
        "deal_amount": amount,
        "paid_amount": paid,
        "remaining_amount": deal_service.remaining(amount, paid),
        "deal_status": deal.status or "pending",
    }


def _lead_out(db: Session, lead: Lead, deal: Deal | None) -> LeadOut:
    d = _lead_to_dict(lead)
    d["source"] = lead.source
    d["service"] = lead.service
    d["stage"] = lead.stage
    d["setter"] = lead.setter
    d["closer"] = lead.closer
    d.update(_money_fields(db, deal))
    return LeadOut(**d)


def _apply_attribution(lead: Lead, data: dict) -> None:
    for field in (
        "source_detail", "content_ref", "utm_source", "utm_medium",
        "utm_campaign", "utm_content", "external_lead_id",
    ):
        if field in data and data[field] is not None:
            setattr(lead, field, data[field])


# ─────────────────────────── Routes ────────────────────────────

@router.get("/stats", response_model=LeadStats)
def lead_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    today = date.today()
    q_base = db.query(Lead).filter(Lead.status == LeadStatus.active)

    q_period = q_base
    if date_from:
        q_period = q_period.filter(Lead.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q_period = q_period.filter(Lead.created_at < datetime.fromisoformat(date_to))

    leads_today = db.query(func.count(Lead.id)).filter(
        Lead.status == LeadStatus.active,
        func.date(Lead.created_at) == today,
    ).scalar() or 0

    leads_period = q_period.count()

    q_meetings = db.query(func.count(Meeting.id)).filter(Meeting.lead_id.isnot(None))
    if date_from:
        q_meetings = q_meetings.filter(Meeting.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q_meetings = q_meetings.filter(Meeting.created_at < datetime.fromisoformat(date_to))
    meetings_period = q_meetings.scalar() or 0

    won_stage_ids = [s.id for s in db.query(LeadStage).filter(LeadStage.is_won == True).all()]
    closed_won = q_period.filter(Lead.stage_id.in_(won_stage_ids)).count() if won_stage_ids else 0

    conversion_pct = round(closed_won / leads_period * 100, 1) if leads_period > 0 else 0.0

    # Money totals come from deals, not from the deprecated lead columns.
    lost_stage_ids = [s.id for s in db.query(LeadStage).filter(LeadStage.is_lost == True).all()]
    exclude_ids = won_stage_ids + lost_stage_ids
    open_q = db.query(Lead.id).filter(Lead.status == LeadStatus.active)
    if exclude_ids:
        open_q = open_q.filter(Lead.stage_id.notin_(exclude_ids))
    open_ids = [r[0] for r in open_q.all()]

    deals_sum = paid_sum = 0
    if open_ids:
        for deal in _deals_by_lead(db, open_ids).values():
            deals_sum += int(deal.amount or 0)
            paid_sum += int(deal.paid_amount or 0)

    return LeadStats(
        leads_today=leads_today,
        leads_period=leads_period,
        meetings_period=meetings_period,
        closed_won=closed_won,
        conversion_pct=conversion_pct,
        deals_sum=deals_sum,
        paid_sum=paid_sum,
        remaining_sum=max(deals_sum - paid_sum, 0),
    )


def _apply_list_filters(q, *, source_id, service_id, setter_id, closer_id, stage_id,
                        date_from, date_to, search):
    """Shared filter set for the list and funnel views of the same page."""
    if source_id:
        q = q.filter(Lead.source_id == source_id)
    if service_id:
        q = q.filter(Lead.service_id == service_id)
    if setter_id:
        q = q.filter(Lead.setter_id == setter_id)
    if closer_id:
        q = q.filter(Lead.closer_id == closer_id)
    if stage_id:
        q = q.filter(Lead.stage_id == stage_id)
    if date_from:
        q = q.filter(Lead.created_at >= datetime.fromisoformat(date_from))
    if date_to:
        q = q.filter(Lead.created_at < datetime.fromisoformat(date_to))
    if search:
        s = f"%{search}%"
        q = q.filter(
            Lead.client_name.ilike(s)
            | Lead.company_name.ilike(s)
            | Lead.phone.ilike(s)
            | Lead.content_ref.ilike(s)
            | Lead.utm_campaign.ilike(s)
            | Lead.external_lead_id.ilike(s)
        )
    return q


@router.get("", response_model=LeadListResponse)
def list_leads(
    source_id: Optional[int] = Query(None),
    service_id: Optional[int] = Query(None),
    setter_id: Optional[int] = Query(None),
    closer_id: Optional[int] = Query(None),
    stage_id: Optional[int] = Query(None),
    status: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(30, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = _eager_lead(db)
    q = _apply_list_filters(
        q, source_id=source_id, service_id=service_id, setter_id=setter_id,
        closer_id=closer_id, stage_id=stage_id, date_from=date_from,
        date_to=date_to, search=search,
    )
    q = q.filter(Lead.status == (status or LeadStatus.active))

    total = q.count()
    items = q.order_by(Lead.created_at.desc()).offset(offset).limit(limit).all()
    deals = _deals_by_lead(db, [l.id for l in items])
    return LeadListResponse(
        items=[_lead_out(db, l, deals.get(l.id)) for l in items],
        total=total,
    )


# ─────────────────────────── Funnel (must be before /{lead_id}) ──

@router.get("/funnel-stats", response_model=FunnelStats)
def funnel_stats(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source_id: Optional[int] = Query(None),
    service_id: Optional[int] = Query(None),
    stage_id: Optional[int] = Query(None),
    setter_id: Optional[int] = Query(None),
    closer_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    stages = active_stages(db)
    stage_map = {s.id: s for s in db.query(LeadStage).all()}

    q = db.query(Lead).filter(Lead.status == LeadStatus.active)
    q = _apply_list_filters(
        q, source_id=source_id, service_id=service_id, setter_id=setter_id,
        closer_id=closer_id, stage_id=stage_id, date_from=date_from,
        date_to=date_to, search=search,
    )
    leads = q.all()
    deals = _deals_by_lead(db, [l.id for l in leads])

    from app.services.leads import _stage_kind
    new_leads = meetings_stage = contracts_sent = waiting_payment_count = closed_won = 0
    deals_sum = paid_sum = 0
    min_pos = min((s.position for s in stages), default=0)

    for lead in leads:
        stage = stage_map.get(lead.stage_id) if lead.stage_id else None
        kind = _stage_kind(stage) if stage else "generic"
        if kind == "generic" and stage and stage.position == min_pos:
            new_leads += 1
        if kind == "meeting":
            meetings_stage += 1
        if kind == "contract":
            contracts_sent += 1
        if kind == "waiting_payment":
            waiting_payment_count += 1
        if kind == "won":
            closed_won += 1
        if kind not in ("won", "lost"):
            deal = deals.get(lead.id)
            if deal is not None:
                deals_sum += int(deal.amount or 0)
                paid_sum += int(deal.paid_amount or 0)

    total = len(leads)
    conversion_pct = round(closed_won / total * 100, 1) if total > 0 else 0.0

    return FunnelStats(
        new_leads=new_leads,
        meetings_stage=meetings_stage,
        contracts_sent=contracts_sent,
        waiting_payment=waiting_payment_count,
        closed_won=closed_won,
        conversion_pct=conversion_pct,
        deals_sum=deals_sum,
        paid_sum=paid_sum,
        remaining_sum=max(deals_sum - paid_sum, 0),
    )


@router.get("/funnel", response_model=FunnelResponse)
def get_funnel(
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    source_id: Optional[int] = Query(None),
    service_id: Optional[int] = Query(None),
    stage_id: Optional[int] = Query(None),
    setter_id: Optional[int] = Query(None),
    closer_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    # Archived stages never appear as funnel columns, but leads that still sit on
    # one are shown under their stage so nothing silently disappears.
    stages = active_stages(db)

    q = _eager_lead(db).filter(Lead.status == LeadStatus.active)
    q = _apply_list_filters(
        q, source_id=source_id, service_id=service_id, setter_id=setter_id,
        closer_id=closer_id, stage_id=stage_id, date_from=date_from,
        date_to=date_to, search=search,
    )
    leads = q.order_by(Lead.created_at.desc()).all()
    deals_by_lead = _deals_by_lead(db, [l.id for l in leads])

    # Latest stage entry per lead, in one query instead of one per card.
    days_map: dict[int, datetime] = {}
    if leads:
        history = (
            db.query(LeadStageHistory)
            .filter(LeadStageHistory.lead_id.in_([l.id for l in leads]))
            .order_by(LeadStageHistory.lead_id, LeadStageHistory.created_at.desc())
            .all()
        )
        current_stage = {l.id: l.stage_id for l in leads}
        for h in history:
            if h.to_stage_id == current_stage.get(h.lead_id) and h.lead_id not in days_map:
                days_map[h.lead_id] = h.created_at

    now = datetime.now(timezone.utc)
    cards: list[FunnelCardOut] = []
    for lead in leads:
        ts = days_map.get(lead.id) or lead.created_at
        if ts is not None and ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        days_in_stage = max(0, (now - ts).days) if ts else 0

        d = _lead_to_dict(lead)
        d["source"] = lead.source
        d["service"] = lead.service
        d["stage"] = lead.stage
        d["setter"] = lead.setter
        d["closer"] = lead.closer
        d["days_in_stage"] = days_in_stage
        d.update(_money_fields(db, deals_by_lead.get(lead.id)))
        cards.append(FunnelCardOut(**d))

    return FunnelResponse(leads=cards, stages=stages)


@router.get("/{lead_id}", response_model=LeadDetailOut)
def get_lead(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    lead = (
        db.query(Lead)
        .options(
            joinedload(Lead.source),
            joinedload(Lead.service),
            joinedload(Lead.stage),
            joinedload(Lead.setter),
            joinedload(Lead.closer),
        )
        .filter(Lead.id == lead_id)
        .first()
    )
    if not lead:
        raise HTTPException(404, "Лид не найден")

    history = (
        db.query(LeadStageHistory)
        .filter(LeadStageHistory.lead_id == lead_id)
        .order_by(LeadStageHistory.created_at)
        .all()
    )
    activities = (
        db.query(LeadActivity)
        .options(joinedload(LeadActivity.responsible))
        .filter(LeadActivity.lead_id == lead_id)
        .filter(LeadActivity.activity_type != "stage_change")
        .order_by(LeadActivity.created_at.desc())
        .all()
    )
    meetings = (
        db.query(Meeting)
        .options(joinedload(Meeting.closer), joinedload(Meeting.setter))
        .filter(Meeting.lead_id == lead_id)
        .order_by(Meeting.meeting_date.desc())
        .all()
    )
    tasks = (
        db.query(Task)
        .options(joinedload(Task.owner))
        .filter(Task.lead_id == lead_id)
        .all()
    )
    files = (
        db.query(LeadFile)
        .options(joinedload(LeadFile.uploader))
        .filter(LeadFile.lead_id == lead_id)
        .order_by(LeadFile.created_at.desc())
        .all()
    )
    timeline = get_lead_timeline(db, lead)

    deal = deal_service.get_deal(db, lead_id)
    payments: list[DealPaymentOut] = []
    if deal is not None:
        rows = (
            db.query(DealPayment)
            .options(joinedload(DealPayment.author), joinedload(DealPayment.editor))
            .filter(DealPayment.deal_id == deal.id)
            .order_by(DealPayment.planned_date, DealPayment.id)
            .all()
        )
        payments = [_payment_out(p) for p in rows]

    return LeadDetailOut(
        **_lead_to_dict(lead),
        source=lead.source,
        service=lead.service,
        stage=lead.stage,
        setter=lead.setter,
        closer=lead.closer,
        stage_history=history,
        activities=activities,
        meetings=meetings,
        tasks=tasks,
        files=files,
        timeline=timeline,
        payments=payments,
        **_money_fields(db, deal),
    )


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(
    body: LeadCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.phone and not body.force:
        existing = db.query(Lead).filter(
            Lead.phone == body.phone,
            Lead.status == LeadStatus.active,
        ).first()
        if existing:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Лид с таким номером уже существует",
                    "existing": {
                        "id": existing.id,
                        "client_name": existing.client_name,
                        "stage_id": existing.stage_id,
                    },
                },
            )

    # Idempotency hook for future ad-platform webhooks.
    if body.external_lead_id:
        dupe = db.query(Lead).filter(Lead.external_lead_id == body.external_lead_id).first()
        if dupe and not body.force:
            raise HTTPException(409, "Лид с таким внешним идентификатором уже существует")

    stage_id = body.stage_id
    if stage_id:
        stage = db.query(LeadStage).filter(LeadStage.id == stage_id).first()
        if stage is None or stage.is_archived:
            raise HTTPException(422, "Выбран недоступный этап")
    else:
        first_stage = next(iter(active_stages(db)), None)
        stage_id = first_stage.id if first_stage else None

    setter_id = body.setter_id or current_user.id

    lead = Lead(
        client_name=body.client_name,
        company_name=body.company_name,
        phone=body.phone,
        whatsapp=body.whatsapp,
        instagram=body.instagram,
        email=body.email,
        address=body.address,
        website=body.website,
        industry=body.industry,
        employees_count=body.employees_count,
        source_id=body.source_id,
        service_id=body.service_id,
        stage_id=stage_id,
        setter_id=setter_id,
        closer_id=body.closer_id,
        comment=body.comment,
        next_action_type=body.next_action_type,
        next_action_at=body.next_action_at,
    )
    _apply_attribution(lead, body.model_dump())
    db.add(lead)
    db.flush()

    # Every lead gets a deal so the deal is the single source of truth from day one.
    deal = deal_service.ensure_deal(db, lead, amount=body.deal_amount)
    deal_service.recalc_deal(db, deal)

    if stage_id:
        db.add(LeadStageHistory(
            lead_id=lead.id,
            from_stage_id=None,
            to_stage_id=stage_id,
            changed_by=current_user.id,
            comment="Лид создан",
        ))

    db.commit()
    db.refresh(lead)
    fresh = _eager_lead(db).filter(Lead.id == lead.id).first()
    return _lead_out(db, fresh, deal_service.get_deal(db, lead.id))


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(
    lead_id: int,
    body: LeadUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    data = body.model_dump(exclude_unset=True)

    if data.get("stage_id"):
        stage = db.query(LeadStage).filter(LeadStage.id == data["stage_id"]).first()
        if stage is None or stage.is_archived:
            raise HTTPException(422, "Выбран недоступный этап")

    deal_amount = data.pop("deal_amount", None)
    for field, val in data.items():
        setattr(lead, field, val)
    lead.updated_at = datetime.now(timezone.utc)

    deal = deal_service.ensure_deal(db, lead)
    if deal_amount is not None:
        try:
            deal_service.assert_amount_covers_schedule(db, deal, int(deal_amount))
        except deal_service.ScheduleError as exc:
            raise HTTPException(422, str(exc))
        deal.amount = int(deal_amount)
    deal_service.recalc_deal(db, deal)

    db.commit()
    fresh = _eager_lead(db).filter(Lead.id == lead_id).first()
    return _lead_out(db, fresh, deal_service.get_deal(db, lead_id))


@router.post("/{lead_id}/archive", response_model=LeadOut)
def archive_lead(
    lead_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    lead.status = LeadStatus.archived
    lead.updated_at = datetime.now(timezone.utc)
    db.commit()
    fresh = _eager_lead(db).filter(Lead.id == lead_id).first()
    return _lead_out(db, fresh, deal_service.get_deal(db, lead_id))


@router.patch("/{lead_id}/stage", response_model=LeadOut)
def change_stage(
    lead_id: int,
    body: StageChangeIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    stage = db.query(LeadStage).filter(LeadStage.id == body.to_stage_id).first()
    if not stage:
        raise HTTPException(404, "Этап не найден")
    if stage.is_archived:
        raise HTTPException(422, "Этап архивирован и недоступен для выбора")

    from app.services.leads import _stage_kind
    kind = _stage_kind(stage)
    extra = body.extra_data

    if kind == "meeting":
        if not extra.get("meeting_date") and not extra.get("date"):
            raise HTTPException(422, "Для этапа «Встреча» необходимо указать дату встречи")
        if not extra.get("closer_id") and not lead.closer_id:
            raise HTTPException(422, "Для этапа «Встреча» необходимо указать клоузера")
    elif kind == "won":
        if not extra.get("paid_amount") and not extra.get("amount"):
            raise HTTPException(422, "Для этапа «Оплачено» необходимо указать сумму оплаты")
        if not extra.get("payment_date"):
            raise HTTPException(422, "Для этапа «Оплачено» необходимо указать дату оплаты")

    try:
        change_lead_stage(
            db, lead, body.to_stage_id, changed_by=current_user.id,
            comment=body.comment, extra_data=extra,
        )
    except StageTransitionError as exc:
        # A partial payment is still worth keeping — commit what was recorded and
        # report why the stage did not move.
        db.commit()
        raise HTTPException(422, str(exc))
    except deal_service.ScheduleError as exc:
        db.rollback()
        raise HTTPException(422, str(exc))

    db.commit()
    fresh = _eager_lead(db).filter(Lead.id == lead_id).first()
    return _lead_out(db, fresh, deal_service.get_deal(db, lead_id))


# ─────────────────────── Payment schedule ────────────────────────

def _can_manage_payments(user: User, lead: Lead) -> bool:
    """Admins, founders, the finance director and the lead's own setter/closer."""
    if user.role == Role.admin or user.is_founder:
        return True
    if user.position == "Финансовый директор":
        return True
    return user.id in (lead.setter_id, lead.closer_id)


def _require_payment_rights(user: User, lead: Lead) -> None:
    if not _can_manage_payments(user, lead):
        raise HTTPException(403, "Нет прав на изменение графика оплат")


class PaymentCreate(BaseModel):
    planned_date: date
    planned_amount: int
    payment_method: str = ""
    account_id: Optional[int] = None
    comment: str = ""


class PaymentUpdate(BaseModel):
    planned_date: Optional[date] = None
    planned_amount: Optional[int] = None
    payment_method: Optional[str] = None
    account_id: Optional[int] = None
    comment: Optional[str] = None
    cancelled: Optional[bool] = None


class PaymentConfirm(BaseModel):
    amount: int
    paid_date: Optional[date] = None
    payment_method: Optional[str] = None
    account_id: Optional[int] = None
    comment: Optional[str] = None


class PaymentScheduleOut(BaseModel):
    deal: Optional[DealOut]
    payments: list[DealPaymentOut]
    unscheduled_amount: int


def _schedule_out(db: Session, deal: Deal | None) -> PaymentScheduleOut:
    if deal is None:
        return PaymentScheduleOut(deal=None, payments=[], unscheduled_amount=0)
    rows = (
        db.query(DealPayment)
        .options(joinedload(DealPayment.author), joinedload(DealPayment.editor))
        .filter(DealPayment.deal_id == deal.id)
        .order_by(DealPayment.planned_date, DealPayment.id)
        .all()
    )
    return PaymentScheduleOut(
        deal=_deal_out(db, deal),
        payments=[_payment_out(p) for p in rows],
        unscheduled_amount=deal_service.unscheduled_amount(db, deal),
    )


@router.get("/{lead_id}/payments", response_model=PaymentScheduleOut)
def list_payments(lead_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    _load_lead(db, lead_id)
    return _schedule_out(db, deal_service.get_deal(db, lead_id))


@router.post("/{lead_id}/payments", response_model=PaymentScheduleOut, status_code=201)
def create_payment(
    lead_id: int,
    body: PaymentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    _require_payment_rights(user, lead)
    if body.planned_amount <= 0:
        raise HTTPException(422, "Сумма планового платежа должна быть больше нуля")

    deal = deal_service.ensure_deal(db, lead)
    try:
        deal_service.assert_schedule_fits(db, deal, body.planned_amount)
    except deal_service.ScheduleError as exc:
        raise HTTPException(422, str(exc))

    db.add(DealPayment(
        deal_id=deal.id,
        planned_date=body.planned_date,
        planned_amount=body.planned_amount,
        paid_amount=0,
        status=PaymentStatus.planned,
        payment_method=body.payment_method,
        account_id=body.account_id,
        comment=body.comment,
        created_by=user.id,
    ))
    db.flush()
    deal_service.recalc_deal(db, deal)
    db.commit()
    return _schedule_out(db, deal_service.get_deal(db, lead_id))


def _load_payment(db: Session, lead_id: int, payment_id: int) -> DealPayment:
    payment = (
        db.query(DealPayment)
        .join(Deal, Deal.id == DealPayment.deal_id)
        .filter(DealPayment.id == payment_id, Deal.lead_id == lead_id)
        .first()
    )
    if payment is None:
        raise HTTPException(404, "Платёж не найден")
    return payment


@router.patch("/{lead_id}/payments/{payment_id}", response_model=PaymentScheduleOut)
def update_payment(
    lead_id: int,
    payment_id: int,
    body: PaymentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    _require_payment_rights(user, lead)
    payment = _load_payment(db, lead_id, payment_id)
    deal = db.query(Deal).filter(Deal.id == payment.deal_id).first()

    data = body.model_dump(exclude_unset=True)
    cancelled = data.pop("cancelled", None)

    if "planned_amount" in data and data["planned_amount"] is not None:
        new_amount = int(data["planned_amount"])
        if new_amount <= 0:
            raise HTTPException(422, "Сумма планового платежа должна быть больше нуля")
        if new_amount < int(payment.paid_amount or 0):
            raise HTTPException(422, "Плановая сумма меньше уже оплаченной")
        try:
            deal_service.assert_schedule_fits(db, deal, new_amount, exclude_payment_id=payment.id)
        except deal_service.ScheduleError as exc:
            raise HTTPException(422, str(exc))

    for field, val in data.items():
        setattr(payment, field, val)

    if cancelled is not None:
        if cancelled:
            if int(payment.paid_amount or 0) > 0:
                raise HTTPException(422, "Нельзя отменить платёж с подтверждённой оплатой")
            payment.status = PaymentStatus.cancelled
        elif payment.status == PaymentStatus.cancelled:
            payment.status = PaymentStatus.planned

    payment.updated_by = user.id
    payment.updated_at = datetime.now(timezone.utc)
    db.flush()
    deal_service.sync_finance_transaction(db, payment, deal)
    deal_service.recalc_deal(db, deal)
    db.commit()
    return _schedule_out(db, deal_service.get_deal(db, lead_id))


@router.post("/{lead_id}/payments/{payment_id}/confirm", response_model=PaymentScheduleOut)
def confirm_payment(
    lead_id: int,
    payment_id: int,
    body: PaymentConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """«Зафиксировать оплату» — records the actually received amount."""
    lead = _load_lead(db, lead_id)
    _require_payment_rights(user, lead)
    payment = _load_payment(db, lead_id, payment_id)

    try:
        deal_service.confirm_payment(
            db, payment,
            amount=body.amount,
            paid_date=body.paid_date,
            user_id=user.id,
            payment_method=body.payment_method,
            account_id=body.account_id,
            comment=body.comment,
        )
    except deal_service.ScheduleError as exc:
        db.rollback()
        raise HTTPException(422, str(exc))

    db.commit()
    return _schedule_out(db, deal_service.get_deal(db, lead_id))


@router.delete("/{lead_id}/payments/{payment_id}", response_model=PaymentScheduleOut)
def delete_payment(
    lead_id: int,
    payment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    _require_payment_rights(user, lead)
    payment = _load_payment(db, lead_id, payment_id)
    deal = db.query(Deal).filter(Deal.id == payment.deal_id).first()

    if int(payment.paid_amount or 0) > 0 and user.role != Role.admin:
        raise HTTPException(403, "Удалить платёж с подтверждённой оплатой может только администратор")

    # Drop the linked income first so revenue never survives its payment.
    payment.status = PaymentStatus.cancelled
    payment.paid_amount = 0
    db.flush()
    deal_service.sync_finance_transaction(db, payment, deal)
    db.delete(payment)
    db.flush()
    deal_service.recalc_deal(db, deal)
    db.commit()
    return _schedule_out(db, deal_service.get_deal(db, lead_id))


# ─────────────────────────── Activities / files ──────────────────

@router.post("/{lead_id}/activities", response_model=LeadActivityOut, status_code=201)
def create_activity(
    lead_id: int,
    body: ActivityCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lead = _load_lead(db, lead_id)
    responsible_id = body.responsible_id or current_user.id
    activity = add_activity(
        db, lead,
        activity_type=body.activity_type,
        channel=body.channel,
        description=body.description,
        responsible_id=responsible_id,
    )
    db.commit()
    db.refresh(activity)
    return db.query(LeadActivity).options(joinedload(LeadActivity.responsible)).filter(LeadActivity.id == activity.id).first()


@router.post("/{lead_id}/files", response_model=LeadFileOut, status_code=201)
def add_file(
    lead_id: int,
    body: FileCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _load_lead(db, lead_id)
    f = LeadFile(
        lead_id=lead_id,
        name=body.name,
        url=body.url,
        file_type=body.file_type,
        uploaded_by=current_user.id,
    )
    db.add(f)
    db.commit()
    db.refresh(f)
    return db.query(LeadFile).options(joinedload(LeadFile.uploader)).filter(LeadFile.id == f.id).first()


@router.delete("/{lead_id}/files/{file_id}", status_code=204)
def delete_file(
    lead_id: int,
    file_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    f = db.query(LeadFile).filter(LeadFile.id == file_id, LeadFile.lead_id == lead_id).first()
    if not f:
        raise HTTPException(404, "Файл не найден")
    db.delete(f)
    db.commit()
