from datetime import date, timedelta

from app.models import Task
from conftest import auth_headers


def _task(db, board, owner) -> Task:
    task = Task(
        title="Согласовать дизайн",
        description="Клиентская версия главного экрана",
        board_id=board.id,
        column_id=board.columns[0].id,
        owner_id=owner.id,
        start_date=date.today(),
        due_date=date.today() + timedelta(days=5),
        assignee_ids=[owner.id],
    )
    db.add(task)
    db.commit()
    return task


def test_public_share_is_read_only_sanitized_and_revocable(client, db, staff, personal_board):
    task = _task(db, personal_board, staff)

    created = client.post(
        f"/api/boards/{personal_board.id}/share",
        headers=auth_headers(staff),
    )
    assert created.status_code == 201
    token = created.json()["token"]
    assert created.json()["public_path"] == f"/share/{token}"

    public = client.get("/api/public/boards/view", headers={"X-Board-Share-Token": token})
    assert public.status_code == 200
    assert public.headers["cache-control"] == "no-store"
    body = public.json()
    assert body["name"] == personal_board.name
    assert body["tasks"][0]["id"] == task.id
    assert body["tasks"][0]["start_date"] == date.today().isoformat()
    assert body["tasks"][0]["due_date"] == (date.today() + timedelta(days=5)).isoformat()
    assert "owner_id" not in body["tasks"][0]
    assert "assignee_ids" not in body["tasks"][0]
    assert "requester" not in body["tasks"][0]

    revoked = client.delete(
        f"/api/boards/{personal_board.id}/share",
        headers=auth_headers(staff),
    )
    assert revoked.status_code == 204
    assert client.get("/api/public/boards/view", headers={"X-Board-Share-Token": token}).status_code == 404


def test_rotating_share_invalidates_previous_link(client, staff, personal_board):
    first = client.post(
        f"/api/boards/{personal_board.id}/share",
        headers=auth_headers(staff),
    ).json()["token"]
    second = client.post(
        f"/api/boards/{personal_board.id}/share",
        headers=auth_headers(staff),
    ).json()["token"]

    assert first != second
    assert client.get("/api/public/boards/view", headers={"X-Board-Share-Token": first}).status_code == 404
    assert client.get("/api/public/boards/view", headers={"X-Board-Share-Token": second}).status_code == 200


def test_non_owner_cannot_publish_personal_board(client, other_staff, personal_board):
    response = client.post(
        f"/api/boards/{personal_board.id}/share",
        headers=auth_headers(other_staff),
    )
    assert response.status_code == 403


def test_task_schedule_rejects_start_after_due_date(client, staff, personal_board):
    response = client.post(
        "/api/tasks",
        headers=auth_headers(staff),
        json={
            "title": "Неверный диапазон",
            "board_id": personal_board.id,
            "start_date": "2026-09-10",
            "due_date": "2026-09-01",
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Дата начала не может быть позже срока"
