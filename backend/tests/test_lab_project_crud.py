from app.models import Board
from conftest import auth_headers


def test_lab_project_crud_keeps_board_consistent_and_archive_revokes_share(
    client,
    db,
    admin,
    staff,
):
    created = client.post(
        "/api/lab-projects",
        headers=auth_headers(admin),
        json={
            "name": "MCP Lab",
            "description": "Первичная версия",
            "status": "Идея",
            "member_ids": [staff.id],
        },
    )
    assert created.status_code == 201, created.text
    project = created.json()
    project_id = project["id"]
    board_id = project["board_id"]
    assert project["user_can_manage"] is True

    board = db.get(Board, board_id)
    assert board is not None
    assert board.name == "MCP Lab"
    assert [column.name for column in board.columns] == ["To-Do", "In Progress", "Done"]

    listed = client.get("/api/lab-projects", headers=auth_headers(admin))
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [project_id]

    updated = client.patch(
        f"/api/lab-projects/{project_id}",
        headers=auth_headers(admin),
        json={
            "name": "MCP Lab 2",
            "description": "Обновлено",
            "status": "Разработка",
            "member_ids": [],
        },
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["name"] == "MCP Lab 2"
    assert updated.json()["members"] == []
    db.expire_all()
    assert db.get(Board, board_id).name == "MCP Lab 2"

    shared = client.post(
        f"/api/boards/{board_id}/share",
        headers=auth_headers(admin),
    )
    assert shared.status_code == 201
    token = shared.json()["token"]
    assert client.get(
        "/api/public/boards/view",
        headers={"X-Board-Share-Token": token},
    ).status_code == 200

    archived = client.post(
        f"/api/lab-projects/{project_id}/archive",
        headers=auth_headers(admin),
    )
    assert archived.status_code == 200, archived.text
    assert archived.json()["is_archived"] is True

    visible_board_ids = {
        item["id"]
        for item in client.get("/api/boards", headers=auth_headers(admin)).json()
    }
    assert board_id not in visible_board_ids
    assert client.get(
        f"/api/boards/{board_id}",
        headers=auth_headers(admin),
    ).status_code == 403
    assert client.get(
        "/api/public/boards/view",
        headers={"X-Board-Share-Token": token},
    ).status_code == 404

    archived_list = client.get(
        "/api/lab-projects?include_archived=true",
        headers=auth_headers(admin),
    )
    assert archived_list.status_code == 200
    assert archived_list.json()[0]["id"] == project_id
