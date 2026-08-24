"""Internal calendar feed: exact ranges, event shape, durations and access rights."""
from datetime import date, datetime, timedelta, timezone

from app.models import Board, BoardColumn, Meeting, MeetingStatus, Task, TaskKind
from tests.conftest import auth_headers


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _window(days_before=1, days_after=7) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    return {
        "date_from": _iso(now - timedelta(days=days_before)),
        "date_to": _iso(now + timedelta(days=days_after)),
    }


def _mk_meeting(db, closer, setter, *, when=None, minutes=60, status=MeetingStatus.scheduled,
                client="Клиент", notes="", address=""):
    m = Meeting(
        client_name=client,
        meeting_date=when or datetime.now(timezone.utc) + timedelta(hours=2),
        duration_minutes=minutes, closer_id=closer.id, setter_id=setter.id,
        status=status, notes=notes, address=address,
    )
    db.add(m)
    db.commit()
    return m


def _mk_task(db, board, owner, **kwargs):
    col = sorted(board.columns, key=lambda c: c.position)[0]
    t = Task(board_id=board.id, column_id=col.id, owner_id=owner.id, **kwargs)
    db.add(t)
    db.commit()
    return t


# ─────────────────────────── Event sources ──────────────────────────────

def test_returns_all_three_internal_sources(client, db, staff, other_staff, personal_board):
    start = datetime.now(timezone.utc) + timedelta(days=1)
    _mk_task(db, personal_board, staff, title="Обычная задача",
             due_date=date.today() + timedelta(days=2))
    _mk_task(db, personal_board, staff, title="Личная встреча",
             kind=TaskKind.meeting, start_at=start, location="Zoom")
    _mk_meeting(db, other_staff, staff, when=start, client="Клиент CRM")

    r = client.get("/api/calendar", params=_window(), headers=auth_headers(staff))
    assert r.status_code == 200, r.text
    body = r.json()

    sources = {e["source"] for e in body["events"]}
    assert sources == {"task", "personal_meeting", "crm_meeting"}
    # The Google source is gone from the contract entirely.
    assert "google_connected" not in body
    assert all(e["source"] != "google" for e in body["events"])


def test_event_payload_has_the_documented_fields(client, db, staff, other_staff, personal_board):
    start = datetime.now(timezone.utc) + timedelta(hours=3)
    _mk_meeting(db, other_staff, staff, when=start, notes="Комментарий", address="Офис")

    r = client.get("/api/calendar", params=_window(), headers=auth_headers(staff))
    event = next(e for e in r.json()["events"] if e["source"] == "crm_meeting")

    for field in (
        "id", "source", "title", "start", "end", "all_day", "status", "location",
        "description", "editable", "task_id", "meeting_id", "lead_id",
    ):
        assert field in event, f"missing {field}"
    assert event["location"] == "Офис"
    assert event["description"] == "Комментарий"
    # Responsible people travel with the event so chips can show them.
    assert event["closer"]["id"] == other_staff.id
    assert event["setter"]["id"] == staff.id


def test_all_day_flag_only_for_tasks_with_due_date(client, db, staff, personal_board):
    _mk_task(db, personal_board, staff, title="Задача", due_date=date.today())
    _mk_task(db, personal_board, staff, title="Встреча", kind=TaskKind.meeting,
             start_at=datetime.now(timezone.utc) + timedelta(hours=1))

    events = client.get("/api/calendar", params=_window(), headers=auth_headers(staff)).json()["events"]
    by_source = {e["source"]: e for e in events}
    assert by_source["task"]["all_day"] is True
    assert by_source["personal_meeting"]["all_day"] is False


# ────────────────────────── Duration / end time ─────────────────────────

def test_meeting_end_derives_from_duration(client, db, staff, other_staff):
    start = datetime.now(timezone.utc) + timedelta(hours=2)
    _mk_meeting(db, other_staff, staff, when=start, minutes=90)

    event = next(
        e for e in client.get("/api/calendar", params=_window(), headers=auth_headers(staff)).json()["events"]
        if e["source"] == "crm_meeting"
    )
    span = datetime.fromisoformat(event["end"]) - datetime.fromisoformat(event["start"])
    assert span == timedelta(minutes=90)


def test_legacy_meeting_falls_back_to_60_minutes(client, db, staff, other_staff):
    """Rows created before durations existed must still render on the grid."""
    m = _mk_meeting(db, other_staff, staff)
    assert m.duration_minutes == 60  # model default

    event = next(
        e for e in client.get("/api/calendar", params=_window(), headers=auth_headers(staff)).json()["events"]
        if e["source"] == "crm_meeting"
    )
    span = datetime.fromisoformat(event["end"]) - datetime.fromisoformat(event["start"])
    assert span == timedelta(minutes=60)


def test_duration_can_be_set_and_updated_via_api(client, db, admin, other_staff):
    r = client.post(
        "/api/meetings",
        json={
            "closer_id": other_staff.id,
            "meeting_date": _iso(datetime.now(timezone.utc) + timedelta(days=1)),
            "client_name": "Клиент",
            "duration_minutes": 120,
        },
        headers=auth_headers(admin),
    )
    assert r.status_code == 201, r.text
    assert r.json()["duration_minutes"] == 120

    meeting_id = r.json()["id"]
    r = client.patch(f"/api/meetings/{meeting_id}", json={"duration_minutes": 30},
                     headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["duration_minutes"] == 30


def test_rejects_absurd_duration(client, db, admin, other_staff):
    r = client.post(
        "/api/meetings",
        json={
            "closer_id": other_staff.id,
            "meeting_date": _iso(datetime.now(timezone.utc)),
            "client_name": "Клиент",
            "duration_minutes": 99999,
        },
        headers=auth_headers(admin),
    )
    assert r.status_code == 422


# ─────────────────────────── Range handling ─────────────────────────────

def test_only_returns_events_overlapping_the_window(client, db, staff, other_staff):
    now = datetime.now(timezone.utc)
    _mk_meeting(db, other_staff, staff, when=now + timedelta(days=2), client="Внутри")
    _mk_meeting(db, other_staff, staff, when=now + timedelta(days=40), client="Далеко")

    events = client.get(
        "/api/calendar",
        params={"date_from": _iso(now), "date_to": _iso(now + timedelta(days=7))},
        headers=auth_headers(staff),
    ).json()["events"]
    titles = {e["title"] for e in events}
    assert "Внутри" in titles
    assert "Далеко" not in titles, "server must honour the exact requested range"


def test_event_starting_before_window_but_running_into_it_is_included(client, db, staff, other_staff):
    now = datetime.now(timezone.utc).replace(microsecond=0)
    # Starts 30 min before the window, runs 120 min → overlaps.
    _mk_meeting(db, other_staff, staff, when=now - timedelta(minutes=30), minutes=120,
                client="Через границу")

    events = client.get(
        "/api/calendar",
        params={"date_from": _iso(now), "date_to": _iso(now + timedelta(hours=6))},
        headers=auth_headers(staff),
    ).json()["events"]
    assert "Через границу" in {e["title"] for e in events}


def test_echoes_the_requested_range(client, db, staff):
    now = datetime.now(timezone.utc).replace(microsecond=0)
    to = now + timedelta(days=1)
    body = client.get(
        "/api/calendar",
        params={"date_from": _iso(now), "date_to": _iso(to)},
        headers=auth_headers(staff),
    ).json()
    assert datetime.fromisoformat(body["date_from"]) == now
    assert datetime.fromisoformat(body["date_to"]) == to


def test_rejects_inverted_range(client, db, staff):
    now = datetime.now(timezone.utc)
    r = client.get(
        "/api/calendar",
        params={"date_from": _iso(now), "date_to": _iso(now - timedelta(days=1))},
        headers=auth_headers(staff),
    )
    assert r.status_code == 422


def test_rejects_unbounded_range(client, db, staff):
    now = datetime.now(timezone.utc)
    r = client.get(
        "/api/calendar",
        params={"date_from": _iso(now), "date_to": _iso(now + timedelta(days=1000))},
        headers=auth_headers(staff),
    )
    assert r.status_code == 422


def test_rejects_malformed_date(client, db, staff):
    r = client.get(
        "/api/calendar",
        params={"date_from": "not-a-date", "date_to": "also-bad"},
        headers=auth_headers(staff),
    )
    assert r.status_code == 422


# ──────────────────────────── Access rights ─────────────────────────────

def test_defaults_to_own_calendar(client, db, staff):
    body = client.get("/api/calendar", params=_window(), headers=auth_headers(staff)).json()
    assert body["user_id"] == staff.id


def test_staff_cannot_open_another_employees_calendar(client, db, staff, other_staff):
    r = client.get(
        f"/api/calendar?user_id={staff.id}",
        params=_window(), headers=auth_headers(other_staff),
    )
    assert r.status_code == 403


def test_personal_tasks_never_leak_to_another_employee(client, db, staff, other_staff, personal_board):
    _mk_task(db, personal_board, staff, title="Личное дело", due_date=date.today())

    # other_staff shares a CRM meeting with staff but must not see staff's tasks.
    _mk_meeting(db, other_staff, staff, client="Общая встреча")

    events = client.get("/api/calendar", params=_window(), headers=auth_headers(other_staff)).json()["events"]
    titles = {e["title"] for e in events}
    assert "Личное дело" not in titles
    assert "Общая встреча" in titles


def test_admin_may_view_an_employee_calendar(client, db, admin, staff, personal_board):
    _mk_task(db, personal_board, staff, title="Задача сотрудника", due_date=date.today())

    r = client.get(
        f"/api/calendar?user_id={staff.id}", params=_window(), headers=auth_headers(admin),
    )
    assert r.status_code == 200
    assert r.json()["user_id"] == staff.id
    assert "Задача сотрудника" in {e["title"] for e in r.json()["events"]}


def test_unknown_user_is_404(client, db, admin):
    r = client.get("/api/calendar?user_id=99999", params=_window(), headers=auth_headers(admin))
    assert r.status_code == 404


def test_crm_meeting_visible_to_both_setter_and_closer(client, db, staff, other_staff):
    _mk_meeting(db, other_staff, staff, client="Совместная")

    for user in (staff, other_staff):
        events = client.get("/api/calendar", params=_window(), headers=auth_headers(user)).json()["events"]
        assert "Совместная" in {e["title"] for e in events}


def test_meeting_of_unrelated_users_is_not_shown(client, db, staff, other_staff, admin):
    # A meeting between admin (closer) and other_staff (setter) — staff is not involved.
    _mk_meeting(db, admin, other_staff, client="Чужая встреча")

    events = client.get("/api/calendar", params=_window(), headers=auth_headers(staff)).json()["events"]
    assert "Чужая встреча" not in {e["title"] for e in events}
