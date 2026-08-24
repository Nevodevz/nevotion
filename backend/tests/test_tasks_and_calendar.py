"""Task reordering, personal-task privacy, calendar access and meeting statuses."""
from datetime import date, datetime, timedelta, timezone

from app.models import (
    Board, BoardColumn, Meeting, MeetingStatus, Task, TaskKind,
)
from tests.conftest import auth_headers


def _cols(board: Board) -> list[BoardColumn]:
    return sorted(board.columns, key=lambda c: c.position)


def _mk_tasks(db, board, column, owner, titles, positions=None):
    made = []
    for i, title in enumerate(titles):
        t = Task(
            title=title, board_id=board.id, column_id=column.id, owner_id=owner.id,
            position=positions[i] if positions else i,
        )
        db.add(t)
        made.append(t)
    db.commit()
    return made


def _order(db, column_id) -> list[str]:
    return [
        t.title for t in
        db.query(Task).filter(Task.column_id == column_id)
        .order_by(Task.position, Task.id).all()
    ]


# ─────────────────────── Reordering inside a column ─────────────────────

def test_reorder_to_top_of_same_column(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C"])

    r = client.patch(
        f"/api/tasks/{tasks[2].id}/move",
        json={"column_id": todo.id, "position": 0},
        headers=auth_headers(staff),
    )
    assert r.status_code == 200, r.text
    assert _order(db, todo.id) == ["C", "A", "B"]


def test_reorder_to_middle_of_same_column(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C", "D"])

    client.patch(
        f"/api/tasks/{tasks[0].id}/move",
        json={"column_id": todo.id, "position": 2},
        headers=auth_headers(staff),
    )
    assert _order(db, todo.id) == ["B", "C", "A", "D"]


def test_reorder_to_end_of_same_column(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C"])

    client.patch(
        f"/api/tasks/{tasks[0].id}/move",
        json={"column_id": todo.id, "position": 99},
        headers=auth_headers(staff),
    )
    assert _order(db, todo.id) == ["B", "C", "A"]


def test_positions_are_contiguous_after_move(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C"])

    client.patch(
        f"/api/tasks/{tasks[1].id}/move",
        json={"column_id": todo.id, "position": 0},
        headers=auth_headers(staff),
    )
    positions = sorted(
        t.position for t in db.query(Task).filter(Task.column_id == todo.id).all()
    )
    assert positions == [0, 1, 2], "no gaps and no duplicates"


def test_duplicate_legacy_positions_are_healed(client, db, staff, personal_board):
    """Legacy rows all defaulted to position 0 — a move must renumber them."""
    todo = _cols(personal_board)[0]
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C"], positions=[0, 0, 0])

    client.patch(
        f"/api/tasks/{tasks[2].id}/move",
        json={"column_id": todo.id, "position": 0},
        headers=auth_headers(staff),
    )
    positions = sorted(
        t.position for t in db.query(Task).filter(Task.column_id == todo.id).all()
    )
    assert positions == [0, 1, 2]
    assert _order(db, todo.id)[0] == "C"


# ─────────────────────── Moving between columns ─────────────────────────

def test_move_into_empty_column(client, db, staff, personal_board):
    todo, progress, _done = _cols(personal_board)
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B"])

    r = client.patch(
        f"/api/tasks/{tasks[0].id}/move",
        json={"column_id": progress.id, "position": 0},
        headers=auth_headers(staff),
    )
    assert r.status_code == 200, r.text
    assert _order(db, progress.id) == ["A"]
    assert _order(db, todo.id) == ["B"]


def test_source_column_closes_its_gap(client, db, staff, personal_board):
    todo, progress, _ = _cols(personal_board)
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B", "C"])

    client.patch(
        f"/api/tasks/{tasks[1].id}/move",
        json={"column_id": progress.id, "position": 0},
        headers=auth_headers(staff),
    )
    positions = sorted(
        t.position for t in db.query(Task).filter(Task.column_id == todo.id).all()
    )
    assert positions == [0, 1]


def test_move_into_middle_of_target_column(client, db, staff, personal_board):
    todo, progress, _ = _cols(personal_board)
    _mk_tasks(db, personal_board, progress, staff, ["X", "Y", "Z"])
    moving = _mk_tasks(db, personal_board, todo, staff, ["A"])[0]

    client.patch(
        f"/api/tasks/{moving.id}/move",
        json={"column_id": progress.id, "position": 1},
        headers=auth_headers(staff),
    )
    assert _order(db, progress.id) == ["X", "A", "Y", "Z"]


def test_move_into_done_column_sets_completed_at(client, db, staff, personal_board):
    todo, _, done = _cols(personal_board)
    task = _mk_tasks(db, personal_board, todo, staff, ["A"])[0]

    client.patch(
        f"/api/tasks/{task.id}/move",
        json={"column_id": done.id, "position": 0},
        headers=auth_headers(staff),
    )
    db.refresh(task)
    assert task.completed_at is not None


def test_move_returns_all_affected_tasks(client, db, staff, personal_board):
    todo, progress, _ = _cols(personal_board)
    tasks = _mk_tasks(db, personal_board, todo, staff, ["A", "B"])

    r = client.patch(
        f"/api/tasks/{tasks[0].id}/move",
        json={"column_id": progress.id, "position": 0},
        headers=auth_headers(staff),
    )
    returned = {t["title"] for t in r.json()["tasks"]}
    assert returned == {"A", "B"}, "client needs both columns to redraw"


# ──────────────────────────── Move permissions ──────────────────────────

def test_staff_cannot_move_another_users_task(client, db, staff, other_staff, personal_board):
    todo = _cols(personal_board)[0]
    task = _mk_tasks(db, personal_board, todo, staff, ["A"])[0]

    r = client.patch(
        f"/api/tasks/{task.id}/move",
        json={"column_id": todo.id, "position": 0},
        headers=auth_headers(other_staff),
    )
    assert r.status_code == 403


def test_admin_can_move_any_task(client, db, admin, staff, personal_board):
    todo, progress, _ = _cols(personal_board)
    task = _mk_tasks(db, personal_board, todo, staff, ["A"])[0]

    r = client.patch(
        f"/api/tasks/{task.id}/move",
        json={"column_id": progress.id, "position": 0},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200


# ──────────────────────────── Task kind ─────────────────────────────────

def test_meeting_kind_requires_a_start_time(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    r = client.post(
        "/api/tasks",
        json={
            "title": "Встреча с клиентом", "board_id": personal_board.id,
            "column_id": todo.id, "kind": "meeting",
        },
        headers=auth_headers(staff),
    )
    assert r.status_code == 422


def test_meeting_task_does_not_create_a_crm_meeting(client, db, staff, personal_board):
    """A personal meeting and a sales meeting are different domain objects."""
    todo = _cols(personal_board)[0]
    start = datetime.now(timezone.utc) + timedelta(days=1)

    r = client.post(
        "/api/tasks",
        json={
            "title": "Личная встреча", "board_id": personal_board.id,
            "column_id": todo.id, "kind": "meeting",
            "start_at": start.isoformat(), "location": "Zoom",
        },
        headers=auth_headers(staff),
    )
    assert r.status_code == 201, r.text
    assert r.json()["kind"] == "meeting"
    assert db.query(Meeting).count() == 0


def test_task_kind_is_independent_of_free_text_task_type(client, db, staff, personal_board):
    todo = _cols(personal_board)[0]
    r = client.post(
        "/api/tasks",
        json={
            "title": "Интеграция API", "board_id": personal_board.id,
            "column_id": todo.id, "task_type": "API",
        },
        headers=auth_headers(staff),
    )
    assert r.status_code == 201
    body = r.json()
    assert body["task_type"] == "API"
    assert body["kind"] == "task", "free-text task_type must not affect kind"


# ─────────────────────────────── Calendar ───────────────────────────────

def test_calendar_shows_own_tasks_meetings_and_crm(client, db, staff, other_staff, personal_board):
    todo = _cols(personal_board)[0]
    start = datetime.now(timezone.utc) + timedelta(days=1)

    db.add(Task(
        title="Обычная задача", board_id=personal_board.id, column_id=todo.id,
        owner_id=staff.id, due_date=date.today() + timedelta(days=2),
    ))
    db.add(Task(
        title="Личная встреча", board_id=personal_board.id, column_id=todo.id,
        owner_id=staff.id, kind=TaskKind.meeting, start_at=start, location="Zoom",
    ))
    db.add(Meeting(
        client_name="Клиент", meeting_date=start, closer_id=other_staff.id,
        setter_id=staff.id, status=MeetingStatus.scheduled, notes="Комментарий",
    ))
    db.commit()

    r = client.get("/api/calendar", headers=auth_headers(staff))
    assert r.status_code == 200, r.text
    by_source = {}
    for e in r.json()["events"]:
        by_source.setdefault(e["source"], []).append(e)

    assert len(by_source.get("task", [])) == 1
    assert len(by_source.get("personal_meeting", [])) == 1
    assert len(by_source.get("crm_meeting", [])) == 1
    # Sources are distinguishable so the UI can style them differently.
    assert by_source["personal_meeting"][0]["task_id"] is not None
    assert by_source["crm_meeting"][0]["meeting_id"] is not None


def test_personal_tasks_are_not_leaked_to_other_staff(client, db, staff, other_staff, personal_board):
    todo = _cols(personal_board)[0]
    db.add(Task(
        title="Личное дело", board_id=personal_board.id, column_id=todo.id,
        owner_id=staff.id, due_date=date.today(),
    ))
    db.commit()

    r = client.get(f"/api/calendar?user_id={staff.id}", headers=auth_headers(other_staff))
    assert r.status_code == 403, "staff must not read another employee's calendar"


def test_admin_may_view_an_employee_calendar(client, db, admin, staff, personal_board):
    todo = _cols(personal_board)[0]
    db.add(Task(
        title="Задача сотрудника", board_id=personal_board.id, column_id=todo.id,
        owner_id=staff.id, due_date=date.today(),
    ))
    db.commit()

    r = client.get(f"/api/calendar?user_id={staff.id}", headers=auth_headers(admin))
    assert r.status_code == 200
    assert r.json()["user_id"] == staff.id
    assert any(e["title"] == "Задача сотрудника" for e in r.json()["events"])


def test_calendar_defaults_to_own_user(client, db, staff, personal_board):
    r = client.get("/api/calendar", headers=auth_headers(staff))
    assert r.json()["user_id"] == staff.id


# ───────────────────────── Meeting status not_held ──────────────────────

def test_not_held_status_exists_and_is_distinct(db):
    assert MeetingStatus.not_held.value == "not_held"
    assert MeetingStatus.not_held not in (MeetingStatus.minus, MeetingStatus.rescheduled)


def test_can_set_meeting_to_not_held(client, db, admin, staff):
    m = Meeting(
        client_name="Клиент", meeting_date=datetime.now(timezone.utc),
        closer_id=admin.id, setter_id=staff.id, status=MeetingStatus.scheduled,
    )
    db.add(m)
    db.commit()

    r = client.patch(f"/api/meetings/{m.id}/status?status=not_held", headers=auth_headers(admin))
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "not_held"


def test_not_held_appears_in_closer_summary(client, db, admin, staff):
    db.add(Meeting(
        client_name="Клиент", meeting_date=datetime.now(timezone.utc),
        closer_id=admin.id, setter_id=staff.id, status=MeetingStatus.not_held,
    ))
    db.commit()

    r = client.get("/api/meetings/summary/all", headers=auth_headers(admin))
    assert r.status_code == 200, r.text
    closers = r.json()["closers"]
    assert closers, "expected the closer to be summarised"
    assert closers[0]["counts"]["not_held"] == 1


def test_meeting_list_reports_total_count_header(client, db, admin, staff):
    for i in range(3):
        db.add(Meeting(
            client_name=f"Клиент {i}", meeting_date=datetime.now(timezone.utc),
            closer_id=admin.id, setter_id=staff.id, status=MeetingStatus.scheduled,
        ))
    db.commit()

    r = client.get("/api/meetings?limit=2", headers=auth_headers(admin))
    assert r.status_code == 200
    assert len(r.json()) == 2
    # Without this a month view cannot tell it was truncated.
    assert r.headers["X-Total-Count"] == "3"
