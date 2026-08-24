"""Stage archiving, the «Демо-тест» retirement, and the fully-paid gate."""
from datetime import date

import pytest

from app.models import Deal, DealPayment, LeadStage, LeadStageHistory, PaymentStatus
from app.services import deals as deal_service
from app.services.leads import StageTransitionError, active_stages, change_lead_stage
from tests.conftest import auth_headers


# ───────────────────────── Archived stages ──────────────────────────────

def test_archived_stage_is_excluded_from_active_sequence(db, stages):
    demo = LeadStage(name="Демо-тест", position=99, is_archived=True)
    db.add(demo)
    db.commit()

    names = [s.name for s in active_stages(db)]
    assert "Демо-тест" not in names
    assert "Созвон" in names


def test_cannot_move_a_lead_onto_an_archived_stage(db, lead, stages):
    demo = LeadStage(name="Демо-тест", position=99, is_archived=True)
    db.add(demo)
    db.commit()

    with pytest.raises(StageTransitionError):
        change_lead_stage(db, lead, demo.id, changed_by=None)


def test_archived_stage_hidden_from_settings_list(client, db, admin, stages):
    demo = LeadStage(name="Демо-тест", position=99, is_archived=True)
    db.add(demo)
    db.commit()
    h = auth_headers(admin)

    names = [s["name"] for s in client.get("/api/settings/stages", headers=h).json()]
    assert "Демо-тест" not in names

    all_names = [
        s["name"] for s in
        client.get("/api/settings/stages?include_archived=true", headers=h).json()
    ]
    assert "Демо-тест" in all_names, "history rendering still needs archived stages"


def test_archiving_a_stage_moves_leads_and_records_history(client, db, admin, lead, stages):
    demo = LeadStage(name="Демо-тест", position=1)
    db.add(demo)
    db.commit()
    lead.stage_id = demo.id
    db.commit()

    r = client.post(f"/api/settings/stages/{demo.id}/archive", headers=auth_headers(admin))
    assert r.status_code == 200, r.text
    assert r.json()["is_archived"] is True

    db.refresh(lead)
    assert lead.stage_id != demo.id, "lead must be moved off the archived stage"

    # Neither the lead nor the stage row is deleted, and the move is explained.
    assert db.query(LeadStage).filter(LeadStage.id == demo.id).first() is not None
    entry = (
        db.query(LeadStageHistory)
        .filter(LeadStageHistory.lead_id == lead.id, LeadStageHistory.from_stage_id == demo.id)
        .first()
    )
    assert entry is not None
    assert "архивирован" in entry.comment


def test_funnel_omits_archived_stage_columns(client, db, admin, lead, stages):
    demo = LeadStage(name="Демо-тест", position=1, is_archived=True)
    db.add(demo)
    db.commit()

    r = client.get("/api/leads/funnel", headers=auth_headers(admin))
    assert r.status_code == 200, r.text
    assert "Демо-тест" not in [s["name"] for s in r.json()["stages"]]


# ─────────────────── Won stage requires full payment ────────────────────

def test_partial_payment_does_not_close_the_deal(db, lead, deal, stages, staff):
    """A partial payment is recorded, but the lead must not reach «Оплачено»."""
    original_stage = lead.stage_id

    with pytest.raises(StageTransitionError) as exc:
        change_lead_stage(
            db, lead, stages["Оплачено"].id, changed_by=staff.id,
            extra_data={"paid_amount": 30_000, "payment_date": str(date.today())},
        )

    assert "Остаток" in str(exc.value)
    assert lead.stage_id == original_stage, "stage must not advance on partial payment"

    # The money is still recorded — nothing is lost.
    db.refresh(deal)
    assert deal.paid_amount == 30_000
    assert deal.status == "partial"


def test_full_payment_moves_lead_to_won(db, lead, deal, stages, staff):
    change_lead_stage(
        db, lead, stages["Оплачено"].id, changed_by=staff.id,
        extra_data={"paid_amount": 100_000, "payment_date": str(date.today())},
    )
    db.commit()

    assert lead.stage_id == stages["Оплачено"].id
    db.refresh(deal)
    assert deal.status == "paid"


def test_topping_up_a_partial_deal_then_closing_works(db, lead, deal, stages, staff):
    with pytest.raises(StageTransitionError):
        change_lead_stage(
            db, lead, stages["Оплачено"].id, changed_by=staff.id,
            extra_data={"paid_amount": 60_000, "payment_date": str(date.today())},
        )
    db.commit()

    change_lead_stage(
        db, lead, stages["Оплачено"].id, changed_by=staff.id,
        extra_data={"paid_amount": 40_000, "payment_date": str(date.today())},
    )
    db.commit()

    assert lead.stage_id == stages["Оплачено"].id
    db.refresh(deal)
    assert deal.paid_amount == 100_000
    assert deal.status == "paid"


def test_partial_payment_via_api_returns_422_but_keeps_money(client, db, admin, lead, deal, stages):
    r = client.patch(
        f"/api/leads/{lead.id}/stage",
        json={
            "to_stage_id": stages["Оплачено"].id,
            "comment": "",
            "extra_data": {"paid_amount": 25_000, "payment_date": str(date.today())},
        },
        headers=auth_headers(admin),
    )
    assert r.status_code == 422
    db.refresh(deal)
    assert deal.paid_amount == 25_000
    assert deal.status == "partial"


# ───────────────────── Contract stage seeds a schedule ──────────────────

def test_contract_stage_seeds_a_full_amount_payment(db, lead, deal, stages, staff):
    change_lead_stage(
        db, lead, stages["Договор"].id, changed_by=staff.id,
        extra_data={"amount": 100_000, "expected_payment_date": str(date.today())},
    )
    db.commit()

    rows = db.query(DealPayment).filter(DealPayment.deal_id == deal.id).all()
    assert len(rows) == 1
    assert rows[0].planned_amount == 100_000
    assert rows[0].status == PaymentStatus.planned


def test_existing_schedule_is_not_overwritten(db, lead, deal, stages, staff):
    db.add(DealPayment(
        deal_id=deal.id, planned_date=date.today(), planned_amount=50_000,
        paid_amount=0, status=PaymentStatus.planned,
    ))
    db.commit()

    change_lead_stage(
        db, lead, stages["Ожидание оплаты"].id, changed_by=staff.id,
        extra_data={"amount": 100_000},
    )
    db.commit()

    rows = db.query(DealPayment).filter(DealPayment.deal_id == deal.id).all()
    assert len(rows) == 1, "a manually built schedule must survive stage changes"
    assert rows[0].planned_amount == 50_000
