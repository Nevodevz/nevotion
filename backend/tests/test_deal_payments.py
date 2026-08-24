"""Deal amount / paid / remaining, partial payments, and finance idempotency."""
from datetime import date, timedelta

import pytest

from app.models import Deal, DealPayment, FinanceTransaction, PaymentStatus
from app.services import deals as deal_service
from tests.conftest import auth_headers


def _add_payment(db, deal, amount, when=None):
    p = DealPayment(
        deal_id=deal.id,
        planned_date=when or date.today(),
        planned_amount=amount,
        paid_amount=0,
        status=PaymentStatus.planned,
    )
    db.add(p)
    db.commit()
    return p


# ───────────────────────── Amount / paid / remaining ─────────────────────

def test_remaining_is_derived_not_stored(db, deal):
    p = _add_payment(db, deal, 40_000)
    deal_service.confirm_payment(db, p, amount=40_000, paid_date=date.today(), user_id=None)
    db.commit()

    assert deal.amount == 100_000
    assert deal.paid_amount == 40_000
    assert deal_service.remaining(deal.amount, deal.paid_amount) == 60_000
    # No column stores the remainder.
    assert not hasattr(deal, "remaining_amount")


def test_remaining_never_goes_negative(db, deal):
    p = _add_payment(db, deal, 100_000)
    deal_service.confirm_payment(db, p, amount=100_000, paid_date=date.today(), user_id=None)
    deal.amount = 80_000  # amount lowered after the fact
    db.commit()
    assert deal_service.remaining(deal.amount, deal.paid_amount) == 0


# ──────────────────────────── Partial / full ─────────────────────────────

def test_partial_payment_sets_partial_status(db, deal):
    p = _add_payment(db, deal, 100_000)
    deal_service.confirm_payment(db, p, amount=30_000, paid_date=date.today(), user_id=None)
    db.commit()

    assert p.status == PaymentStatus.partial
    assert deal.status == "partial"
    assert deal.paid_amount == 30_000
    assert not deal_service.deal_is_fully_paid(db, deal)


def test_full_payment_sets_paid_status(db, deal):
    p = _add_payment(db, deal, 100_000)
    deal_service.confirm_payment(db, p, amount=100_000, paid_date=date.today(), user_id=None)
    db.commit()

    assert p.status == PaymentStatus.paid
    assert deal.status == "paid"
    assert deal_service.deal_is_fully_paid(db, deal)


def test_two_instalments_add_up_to_paid(db, deal):
    p1 = _add_payment(db, deal, 60_000)
    p2 = _add_payment(db, deal, 40_000)
    deal_service.confirm_payment(db, p1, amount=60_000, paid_date=date.today(), user_id=None)
    db.commit()
    assert deal.status == "partial"

    deal_service.confirm_payment(db, p2, amount=40_000, paid_date=date.today(), user_id=None)
    db.commit()
    assert deal.status == "paid"
    assert deal.paid_amount == 100_000


def test_no_payments_means_pending(db, deal):
    deal_service.recalc_deal(db, deal)
    db.commit()
    assert deal.status == "pending"
    assert deal.paid_amount == 0


# ──────────────────── Schedule cannot exceed deal amount ─────────────────

def test_schedule_total_cannot_exceed_deal_amount(db, deal):
    _add_payment(db, deal, 70_000)
    with pytest.raises(deal_service.ScheduleError):
        deal_service.assert_schedule_fits(db, deal, 40_000)


def test_schedule_exactly_matching_amount_is_allowed(db, deal):
    _add_payment(db, deal, 70_000)
    deal_service.assert_schedule_fits(db, deal, 30_000)  # must not raise


def test_confirm_cannot_exceed_planned_amount(db, deal):
    p = _add_payment(db, deal, 50_000)
    with pytest.raises(deal_service.ScheduleError):
        deal_service.confirm_payment(db, p, amount=60_000, paid_date=date.today(), user_id=None)


def test_lowering_deal_amount_below_schedule_is_rejected(db, deal):
    _add_payment(db, deal, 90_000)
    with pytest.raises(deal_service.ScheduleError):
        deal_service.assert_amount_covers_schedule(db, deal, 50_000)


def test_unscheduled_amount_reports_undistributed_money(db, deal):
    _add_payment(db, deal, 30_000)
    assert deal_service.unscheduled_amount(db, deal) == 70_000


# ──────────────────── Finance transaction idempotency ────────────────────

def test_confirmed_payment_creates_one_transaction(db, deal):
    p = _add_payment(db, deal, 50_000)
    deal_service.confirm_payment(db, p, amount=50_000, paid_date=date.today(), user_id=None)
    db.commit()

    txs = db.query(FinanceTransaction).filter(
        FinanceTransaction.related_deal_id == deal.id
    ).all()
    assert len(txs) == 1
    assert txs[0].amount == 50_000
    assert p.finance_transaction_id == txs[0].id


def test_reconfirming_updates_instead_of_duplicating(db, deal):
    p = _add_payment(db, deal, 50_000)
    deal_service.confirm_payment(db, p, amount=20_000, paid_date=date.today(), user_id=None)
    db.commit()
    deal_service.confirm_payment(db, p, amount=50_000, paid_date=date.today(), user_id=None)
    db.commit()

    txs = db.query(FinanceTransaction).filter(
        FinanceTransaction.related_deal_id == deal.id
    ).all()
    assert len(txs) == 1, "re-confirming must not double-count revenue"
    assert txs[0].amount == 50_000
    assert deal.paid_amount == 50_000


def test_zeroing_a_payment_removes_its_transaction(db, deal):
    p = _add_payment(db, deal, 50_000)
    deal_service.confirm_payment(db, p, amount=50_000, paid_date=date.today(), user_id=None)
    db.commit()
    deal_service.confirm_payment(db, p, amount=0, paid_date=None, user_id=None)
    db.commit()

    txs = db.query(FinanceTransaction).filter(
        FinanceTransaction.related_deal_id == deal.id
    ).all()
    assert txs == []
    assert deal.status == "pending"


# ──────────────────────────── Overdue is derived ─────────────────────────

def test_overdue_is_computed_from_date_and_outstanding(db, deal):
    yesterday = date.today() - timedelta(days=1)
    p = _add_payment(db, deal, 50_000, when=yesterday)
    assert deal_service.is_overdue(p) is True
    assert deal_service.payment_display_status(p) == "overdue"

    deal_service.confirm_payment(db, p, amount=50_000, paid_date=date.today(), user_id=None)
    db.commit()
    assert deal_service.is_overdue(p) is False
    assert deal_service.payment_display_status(p) == "paid"


def test_partially_paid_past_due_is_still_overdue(db, deal):
    yesterday = date.today() - timedelta(days=1)
    p = _add_payment(db, deal, 50_000, when=yesterday)
    deal_service.confirm_payment(db, p, amount=10_000, paid_date=yesterday, user_id=None)
    db.commit()
    assert deal_service.is_overdue(p) is True


def test_cancelled_payment_is_never_overdue(db, deal):
    p = _add_payment(db, deal, 50_000, when=date.today() - timedelta(days=5))
    p.status = PaymentStatus.cancelled
    db.commit()
    assert deal_service.is_overdue(p) is False


# ───────────────────────────── API surface ───────────────────────────────

def test_payment_api_roundtrip(client, db, admin, lead, deal):
    h = auth_headers(admin)

    r = client.post(
        f"/api/leads/{lead.id}/payments",
        json={"planned_date": str(date.today()), "planned_amount": 60_000},
        headers=h,
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["unscheduled_amount"] == 40_000
    payment_id = body["payments"][0]["id"]

    r = client.post(
        f"/api/leads/{lead.id}/payments/{payment_id}/confirm",
        json={"amount": 25_000, "paid_date": str(date.today())},
        headers=h,
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["deal"]["paid_amount"] == 25_000
    assert body["deal"]["remaining_amount"] == 75_000
    assert body["deal"]["status"] == "partial"
    assert body["payments"][0]["status"] == "partial"


def test_payment_api_rejects_schedule_overflow(client, db, admin, lead, deal):
    h = auth_headers(admin)
    client.post(
        f"/api/leads/{lead.id}/payments",
        json={"planned_date": str(date.today()), "planned_amount": 80_000},
        headers=h,
    )
    r = client.post(
        f"/api/leads/{lead.id}/payments",
        json={"planned_date": str(date.today()), "planned_amount": 50_000},
        headers=h,
    )
    assert r.status_code == 422
    assert "график" in r.json()["detail"].lower()


def test_unrelated_staff_cannot_touch_schedule(client, db, lead, deal, stages):
    from app.core.security import hash_password
    from app.models import Role, User

    intruder = User(
        name="Чужой", email="intruder@test.kg", password_hash=hash_password("x"),
        role=Role.staff, position="Промпт-инженер", is_active=True,
    )
    db.add(intruder)
    db.commit()

    r = client.post(
        f"/api/leads/{lead.id}/payments",
        json={"planned_date": str(date.today()), "planned_amount": 1000},
        headers=auth_headers(intruder),
    )
    assert r.status_code == 403
