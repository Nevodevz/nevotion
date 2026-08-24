"""Nevocean's own internal calendar feed.

Merges three internal sources into one list of unified events:

  * ``task``             — personal tasks with a due date (all-day)
  * ``personal_meeting`` — personal board cards of kind=meeting
  * ``crm_meeting``      — CRM meetings where the user is setter or closer

There is no external calendar provider: Nevocean stores and serves its own
schedule.

Privacy: a user sees only their own calendar. Admins and founders may open an
employee's calendar, matching the existing employee-management rights. Personal
tasks belonging to other employees are never returned.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Board, Meeting, Role, Task, TaskKind, User
from app.routers.meetings import DEFAULT_MEETING_MINUTES
from app.schemas import UserOut

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

# Guard against a client asking for an unbounded span.
MAX_RANGE_DAYS = 400


class CalendarEvent(BaseModel):
    id: str                     # unique across sources, e.g. "task-12"
    source: str                 # task | personal_meeting | crm_meeting
    title: str
    start: datetime
    end: Optional[datetime] = None
    all_day: bool = False
    status: str = ""
    location: str = ""
    description: str = ""
    editable: bool = True
    # Deep-link targets so a click opens the right card.
    task_id: Optional[int] = None
    meeting_id: Optional[int] = None
    lead_id: Optional[int] = None
    board_id: Optional[int] = None
    # People shown on the event chip.
    owner: Optional[UserOut] = None
    closer: Optional[UserOut] = None
    setter: Optional[UserOut] = None


class CalendarResponse(BaseModel):
    events: list[CalendarEvent]
    user_id: int
    date_from: datetime
    date_to: datetime


def _can_view_calendar(viewer: User, target_user_id: int) -> bool:
    """Own calendar always; other people's only for admins/founders."""
    if viewer.id == target_user_id:
        return True
    return viewer.role == Role.admin or viewer.is_founder


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


def _parse_bound(raw: str | None, fallback: datetime) -> datetime:
    if not raw:
        return fallback
    try:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(422, "Некорректный формат даты (ожидается ISO 8601)")
    return parsed.replace(tzinfo=timezone.utc) if parsed.tzinfo is None else parsed


@router.get("", response_model=CalendarResponse)
def get_calendar(
    user_id: Optional[int] = Query(None, description="Чей календарь (по умолчанию — свой)"),
    date_from: Optional[str] = Query(None, description="Начало диапазона, ISO 8601 UTC"),
    date_to: Optional[str] = Query(None, description="Конец диапазона, ISO 8601 UTC"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Events overlapping [date_from, date_to).

    The client sends the exact window for the view it is rendering (a day, a
    week, a month or an agenda span) — the server never widens it by months.
    """
    target_id = user_id or current_user.id
    if not _can_view_calendar(current_user, target_id):
        raise HTTPException(403, "Нет доступа к календарю этого сотрудника")

    target = db.get(User, target_id)
    if target is None:
        raise HTTPException(404, "Сотрудник не найден")

    now = datetime.now(timezone.utc)
    start = _parse_bound(date_from, now - timedelta(days=1))
    end = _parse_bound(date_to, start + timedelta(days=7))
    if end <= start:
        raise HTTPException(422, "date_to должен быть позже date_from")
    if (end - start).days > MAX_RANGE_DAYS:
        raise HTTPException(422, f"Слишком большой диапазон (максимум {MAX_RANGE_DAYS} дней)")

    events: list[CalendarEvent] = []

    # ── 1. Personal tasks (own board only — personal tasks stay private) ──
    board_ids = [
        b.id for b in db.query(Board).filter(
            Board.kind == "personal", Board.owner_id == target_id
        ).all()
    ]
    if board_ids:
        tasks = (
            db.query(Task)
            .options(joinedload(Task.owner))
            .filter(Task.board_id.in_(board_ids), Task.owner_id == target_id)
            .all()
        )
        for t in tasks:
            if t.kind == TaskKind.meeting:
                st = _as_utc(t.start_at)
                if st is None:
                    continue
                en = _as_utc(t.end_at) or st + timedelta(minutes=DEFAULT_MEETING_MINUTES)
                # Overlap test, so an event spanning the window edge still shows.
                if en <= start or st >= end:
                    continue
                events.append(CalendarEvent(
                    id=f"task-{t.id}", source="personal_meeting", title=t.title,
                    start=st, end=en, location=t.location or "",
                    description=t.description or "",
                    status="done" if t.completed_at else "open",
                    task_id=t.id, board_id=t.board_id, lead_id=t.lead_id,
                    owner=t.owner,
                ))
            else:
                if not t.due_date:
                    continue
                st = datetime.combine(t.due_date, datetime.min.time(), tzinfo=timezone.utc)
                en = st + timedelta(days=1)
                if en <= start or st >= end:
                    continue
                events.append(CalendarEvent(
                    id=f"task-{t.id}", source="task", title=t.title, start=st, end=en,
                    all_day=True, description=t.description or "",
                    status="done" if t.completed_at else "open",
                    task_id=t.id, board_id=t.board_id, lead_id=t.lead_id,
                    owner=t.owner,
                ))

    # ── 2. CRM meetings where the user is setter or closer ──
    # Widened by the longest possible meeting so one starting before the window
    # but running into it is still returned.
    meetings = (
        db.query(Meeting)
        .options(joinedload(Meeting.closer), joinedload(Meeting.setter))
        .filter(
            (Meeting.closer_id == target_id) | (Meeting.setter_id == target_id),
            Meeting.meeting_date >= start - timedelta(days=1),
            Meeting.meeting_date < end,
        )
        .all()
    )
    for m in meetings:
        st = _as_utc(m.meeting_date)
        if st is None:
            continue
        en = st + timedelta(minutes=m.duration_minutes or DEFAULT_MEETING_MINUTES)
        if en <= start or st >= end:
            continue
        events.append(CalendarEvent(
            id=f"meeting-{m.id}", source="crm_meeting",
            title=m.client_name, start=st, end=en,
            location=m.address or "", description=m.notes or "",
            status=m.status.value if hasattr(m.status, "value") else str(m.status),
            meeting_id=m.id, lead_id=m.lead_id,
            editable=(m.closer_id == target_id or m.setter_id == target_id),
            closer=m.closer, setter=m.setter,
        ))

    events.sort(key=lambda e: e.start)
    return CalendarResponse(events=events, user_id=target_id, date_from=start, date_to=end)
