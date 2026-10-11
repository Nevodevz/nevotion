import pytest

from app.models import Lead, LeadActivity, LeadBoardColumn, LeadBoardPlacement, LeadStageHistory, LeadStatus, Meeting
from conftest import auth_headers


def column(client, admin, name="На проверке"):
    response = client.post("/api/lead-board/columns", json={"name": name, "color": "#16a34a"}, headers=auth_headers(admin))
    assert response.status_code == 201, response.text
    return response.json()


def move(client, user, lead_id, target, **extra):
    return client.patch(f"/api/lead-board/leads/{lead_id}/move", json={"column_id": target, **extra}, headers=auth_headers(user))


def test_existing_leads_start_unassigned_and_archived_are_excluded(client, db, admin, lead):
    archived = Lead(client_name="Архив", status=LeadStatus.archived)
    db.add(archived)
    db.commit()
    response = client.get("/api/lead-board", headers=auth_headers(admin))
    assert response.status_code == 200
    assert response.json()["columns"] == []
    assert [card["id"] for card in response.json()["leads"]] == [lead.id]
    assert response.json()["leads"][0]["board_column_id"] is None


def test_board_move_never_changes_funnel_finance_or_activity(client, db, admin, staff, lead, deal):
    target = column(client, admin)
    before = (lead.stage_id, lead.status, lead.updated_at, deal.amount, deal.paid_amount)
    response = move(client, staff, lead.id, target["id"], expected_column_id=None)
    assert response.status_code == 200, response.text
    assert response.json()["board_column_id"] == target["id"]
    assert response.json()["stage_id"] == before[0]
    assert response.json()["deal_amount"] == before[3]
    db.refresh(lead)
    db.refresh(deal)
    assert (lead.stage_id, lead.status, lead.updated_at, deal.amount, deal.paid_amount) == before
    assert db.query(LeadStageHistory).count() == 0
    assert db.query(LeadActivity).count() == 0
    assert db.query(Meeting).count() == 0
    assert db.get(LeadBoardPlacement, lead.id).updated_by == staff.id


def test_order_persists_and_can_return_to_unassigned(client, db, admin, lead):
    target = column(client, admin)
    another = Lead(client_name="Второй", status=LeadStatus.active, stage_id=lead.stage_id)
    db.add(another)
    db.commit()
    assert move(client, admin, lead.id, target["id"]).status_code == 200
    assert move(client, admin, another.id, target["id"], before_lead_id=lead.id).status_code == 200
    board = client.get("/api/lead-board", headers=auth_headers(admin)).json()
    assert [card["id"] for card in board["leads"]] == [another.id, lead.id]
    assert move(client, admin, lead.id, None, expected_column_id=target["id"]).status_code == 200
    assert db.get(LeadBoardPlacement, lead.id).column_id is None


def test_stale_move_is_rejected_without_overwriting_another_user(client, db, admin, staff, lead):
    first = column(client, admin)
    second = column(client, admin, "Готово к обсуждению")
    assert move(client, admin, lead.id, first["id"], expected_column_id=None).status_code == 200
    response = move(client, staff, lead.id, second["id"], expected_column_id=None)
    assert response.status_code == 409
    assert db.get(LeadBoardPlacement, lead.id).column_id == first["id"]


@pytest.mark.parametrize("method,path,body", [
    ("post", "/api/lead-board/columns", {"name": "Столбец"}),
    ("patch", "/api/lead-board/columns/999", {"name": "Изменено"}),
    ("post", "/api/lead-board/columns/999/move", {}),
    ("delete", "/api/lead-board/columns/999", None),
])
def test_column_management_requires_admin(client, staff, method, path, body):
    kwargs = {"headers": auth_headers(staff)}
    if body is not None:
        kwargs["json"] = body
    assert getattr(client, method)(path, **kwargs).status_code == 403


def test_column_edit_reorder_and_delete_keep_leads(client, db, admin, lead):
    first = column(client, admin)
    second = column(client, admin, "Обсудить")
    assert client.patch(f"/api/lead-board/columns/{first['id']}", json={"name": "  Согласование  "}, headers=auth_headers(admin)).json()["name"] == "Согласование"
    response = client.post(f"/api/lead-board/columns/{second['id']}/move", json={"before_column_id": first["id"]}, headers=auth_headers(admin))
    assert [item["id"] for item in response.json()] == [second["id"], first["id"]]
    assert move(client, admin, lead.id, first["id"]).status_code == 200
    assert client.delete(f"/api/lead-board/columns/{first['id']}", headers=auth_headers(admin)).status_code == 204
    assert db.get(Lead, lead.id) is not None
    assert db.get(LeadBoardPlacement, lead.id).column_id is None


@pytest.mark.parametrize("body", [{"name": "   "}, {"name": "Столбец", "color": "red"}, {"name": "x" * 121}])
def test_invalid_column_metadata_is_rejected(client, admin, body):
    assert client.post("/api/lead-board/columns", json=body, headers=auth_headers(admin)).status_code == 422


def test_invalid_destinations_and_archived_leads_do_not_move(client, db, admin, lead):
    target = column(client, admin)
    assert move(client, admin, lead.id, 999).status_code == 404
    assert move(client, admin, lead.id, target["id"], before_lead_id=999).status_code == 422
    assert move(client, admin, lead.id, target["id"], before_lead_id=lead.id).status_code == 422
    assert db.get(LeadBoardPlacement, lead.id) is None
    lead.status = LeadStatus.archived
    db.commit()
    assert move(client, admin, lead.id, target["id"]).status_code == 422


def test_board_filters_preserve_independent_placement(client, db, admin, lead):
    target = column(client, admin)
    move(client, admin, lead.id, target["id"])
    response = client.get(f"/api/lead-board?search={lead.client_name}&stage_id={lead.stage_id}", headers=auth_headers(admin))
    assert response.status_code == 200
    assert [card["id"] for card in response.json()["leads"]] == [lead.id]
    assert response.json()["leads"][0]["board_column_id"] == target["id"]
    assert client.get("/api/lead-board?search=not-found", headers=auth_headers(admin)).json()["leads"] == []


def test_unauthenticated_requests_are_rejected(client):
    assert client.get("/api/lead-board").status_code == 401


def test_invalid_date_filter_is_rejected(client, admin):
    assert client.get("/api/lead-board?date_from=not-a-date", headers=auth_headers(admin)).status_code == 422
