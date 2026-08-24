import calendar
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Meeting, MeetingStatus, User, Role
from app.schemas import UserOut

router = APIRouter(prefix="/api/meetings", tags=["meetings"])

# Meetings have no explicit end time; duration drives where they sit on the
# calendar's hour grid. 60 minutes is the safe fallback for legacy rows.
DEFAULT_MEETING_MINUTES = 60

# ---------- Schemas ----------
# `notes` is the canonical storage for the user-facing «Комментарий» field —
# deliberately not duplicated into a second column.
class MeetingCreate(BaseModel):
    closer_id: int
    meeting_date: datetime
    address: str = ""
    client_name: str
    client_phone: str = ""
    notes: str = ""
    duration_minutes: int = Field(DEFAULT_MEETING_MINUTES, ge=5, le=24 * 60)
    lead_id: Optional[int] = None
    parent_id: Optional[int] = None

class MeetingUpdate(BaseModel):
    closer_id: Optional[int] = None
    meeting_date: Optional[datetime] = None
    address: Optional[str] = None
    client_name: Optional[str] = None
    client_phone: Optional[str] = None
    notes: Optional[str] = None
    duration_minutes: Optional[int] = Field(None, ge=5, le=24 * 60)
    status: Optional[MeetingStatus] = None

class MeetingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    closer_id: Optional[int]
    setter_id: Optional[int]
    meeting_date: datetime
    address: str
    client_name: str
    client_phone: str
    status: MeetingStatus
    notes: str
    duration_minutes: int = DEFAULT_MEETING_MINUTES
    parent_id: Optional[int]
    lead_id: Optional[int] = None
    created_at: datetime
    closer: Optional[UserOut] = None
    setter: Optional[UserOut] = None
    sub_meetings: list["MeetingOut"] = []

MeetingOut.model_rebuild()

# ---------- Helpers ----------
# Финансовый директор (Адахан) also participates in sales as a closer
_CLOSER_POSITIONS = {"Клоузер", "Финансовый директор"}
_SETTER_POSITIONS = {"Сеттер", "Руководитель продаж"}

def _can_create(user: User) -> bool:
    return user.role == Role.admin or user.position in _SETTER_POSITIONS

def _can_change_status(user: User, meeting: Meeting) -> bool:
    """Клоузер может менять статус своей встречи, admin — любой."""
    if user.role == Role.admin:
        return True
    return meeting.closer_id == user.id

def _load(db: Session, meeting_id: int) -> Meeting:
    m = db.query(Meeting).options(
        joinedload(Meeting.closer), joinedload(Meeting.setter),
        joinedload(Meeting.sub_meetings).joinedload(Meeting.closer),
        joinedload(Meeting.sub_meetings).joinedload(Meeting.setter),
    ).filter(Meeting.id == meeting_id).first()
    if not m:
        raise HTTPException(404, "Встреча не найдена")
    return m

# ---------- Routes ----------
@router.get("", response_model=list[MeetingOut])
def list_meetings(
    response: Response,
    closer_id: Optional[int] = Query(None),
    setter_id: Optional[int] = Query(None),
    status: Optional[MeetingStatus] = Query(None),
    year:  Optional[int] = Query(None),
    month: Optional[int] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    parent_only: bool = Query(True),   # default: skip sub-meetings in top-level list
    # A month can easily exceed the old 50-item cap, which silently truncated the
    # calendar. The default now covers a full month and `X-Total-Count` lets a
    # client detect when it still needs to page.
    limit: int = Query(500, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    q = db.query(Meeting).options(
        joinedload(Meeting.closer), joinedload(Meeting.setter),
        joinedload(Meeting.sub_meetings).joinedload(Meeting.closer),
    )
    if parent_only:
        q = q.filter(Meeting.parent_id.is_(None))
    if closer_id:
        q = q.filter(Meeting.closer_id == closer_id)
    if setter_id:
        q = q.filter(Meeting.setter_id == setter_id)
    if status:
        q = q.filter(Meeting.status == status)
    if year and month:
        # Filter by Bishkek-local month boundaries (UTC+6), converted to UTC,
        # so a meeting whose local date falls in this month isn't dropped
        # just because its UTC timestamp spills into the adjacent month.
        BISHKEK_OFFSET = timedelta(hours=6)
        days_in_month = calendar.monthrange(year, month)[1]
        local_start = datetime(year, month, 1, 0, 0, 0)
        local_end = datetime(year, month, days_in_month, 23, 59, 59)
        start_utc = local_start - BISHKEK_OFFSET
        end_utc = local_end - BISHKEK_OFFSET
        q = q.filter(
            Meeting.meeting_date >= start_utc,
            Meeting.meeting_date <= end_utc,
        )
    if date_from:
        q = q.filter(Meeting.meeting_date >= date_from)
    if date_to:
        q = q.filter(Meeting.meeting_date <= date_to)
    total = q.count()
    meetings = q.order_by(Meeting.meeting_date).offset(offset).limit(limit).all()
    response.headers["X-Total-Count"] = str(total)
    return meetings


@router.post("", response_model=MeetingOut, status_code=201)
def create_meeting(
    payload: MeetingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not _can_create(user):
        raise HTTPException(403, "Назначать встречи могут только сеттеры и администраторы")
    m = Meeting(
        closer_id=payload.closer_id, setter_id=user.id,
        meeting_date=payload.meeting_date, address=payload.address,
        client_name=payload.client_name, client_phone=payload.client_phone,
        notes=payload.notes, duration_minutes=payload.duration_minutes,
        parent_id=payload.parent_id, lead_id=payload.lead_id,
        status=MeetingStatus.scheduled,
    )
    db.add(m)
    db.commit()
    return _load(db, m.id)


@router.get("/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return _load(db, meeting_id)


@router.patch("/{meeting_id}", response_model=MeetingOut)
def update_meeting(
    meeting_id: int, payload: MeetingUpdate,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    m = _load(db, meeting_id)
    data = payload.model_dump(exclude_unset=True)

    # Only admin/setter can edit non-status fields
    non_status = {k: v for k, v in data.items() if k != "status"}
    if non_status and not _can_create(user) and user.role != Role.admin:
        raise HTTPException(403, "Нет прав на редактирование встречи")

    # Status change: closer or admin only
    if "status" in data and not _can_change_status(user, m):
        raise HTTPException(403, "Только клоузер может менять статус своей встречи")

    for k, v in data.items():
        setattr(m, k, v)
    db.commit()
    return _load(db, meeting_id)


@router.patch("/{meeting_id}/status", response_model=MeetingOut)
def change_status(
    meeting_id: int, status: MeetingStatus,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    m = _load(db, meeting_id)
    if not _can_change_status(user, m):
        raise HTTPException(403, "Только клоузер может менять статус своей встречи")
    m.status = status
    db.commit()
    return _load(db, meeting_id)


@router.delete("/{meeting_id}", status_code=204)
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
):
    m = db.get(Meeting, meeting_id)
    if not m:
        raise HTTPException(404, "Встреча не найдена")
    if not _can_create(user) and user.role != Role.admin:
        raise HTTPException(403, "Нет прав")
    db.delete(m); db.commit()


# ---------- Summary ----------
@router.get("/summary/all")
def sales_summary(
    date_from: Optional[str] = Query(None),
    date_to:   Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Aggregate stats: setter records + closer meeting outcomes."""
    from app.models import SalesRecord, ColumnDef, Department
    from sqlalchemy import func as sqlfunc

    # --- Setter summary (sum of all metric columns per user) ---
    sales_dept = db.query(Department).filter(Department.kind == "sales").first()
    col_defs = []
    if sales_dept:
        col_defs = db.query(ColumnDef).filter(ColumnDef.department_id == sales_dept.id).order_by(ColumnDef.position).all()

    rec_q = db.query(SalesRecord).options(joinedload(SalesRecord.user))
    if date_from:
        rec_q = rec_q.filter(SalesRecord.record_date >= date_from)
    if date_to:
        rec_q = rec_q.filter(SalesRecord.record_date <= date_to)
    records = rec_q.all()

    setter_map: dict = {}
    for r in records:
        uid = r.user_id
        if uid not in setter_map:
            setter_map[uid] = {"user": r.user, "totals": {}}
        for col in col_defs:
            val = r.metrics.get(col.key, 0)
            setter_map[uid]["totals"][col.key] = setter_map[uid]["totals"].get(col.key, 0) + (val or 0)

    setter_summary = [
        {"user": v["user"], "totals": v["totals"]}
        for v in setter_map.values()
    ]

    # --- Closer summary (meeting status counts per closer) ---
    m_q = db.query(Meeting).options(joinedload(Meeting.closer)).filter(Meeting.parent_id.is_(None))
    if date_from:
        m_q = m_q.filter(Meeting.meeting_date >= date_from)
    if date_to:
        m_q = m_q.filter(Meeting.meeting_date <= date_to)
    meetings = m_q.all()

    closer_map: dict = {}
    statuses = [s.value for s in MeetingStatus]
    for m in meetings:
        cid = m.closer_id
        if cid not in closer_map:
            closer_map[cid] = {"user": m.closer, "counts": {s: 0 for s in statuses}, "total": 0}
        closer_map[cid]["counts"][m.status.value] += 1
        closer_map[cid]["total"] += 1

    closer_summary = [
        {"user": v["user"], "counts": v["counts"], "total": v["total"]}
        for v in closer_map.values()
    ]

    return {
        "setters": setter_summary,
        "closers": closer_summary,
        "col_defs": [{"key": c.key, "label": c.label} for c in col_defs],
    }
