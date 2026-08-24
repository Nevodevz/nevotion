"""Shared test fixtures.

Tests run against an in-memory SQLite database with the ORM metadata created
directly, so they exercise application logic without needing PostgreSQL.
"""
import os
import sys
from pathlib import Path

# Import the app package from the backend root regardless of the pytest rootdir.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("MEDIA_ROOT", "/tmp/nevocean-test-media")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import hash_password
from app.main import app
from app.models import (
    Account, Board, BoardColumn, Deal, Lead, LeadStage, LeadStatus, Role, User,
)


@pytest.fixture()
def engine():
    eng = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=eng)
    yield eng
    Base.metadata.drop_all(bind=eng)


@pytest.fixture()
def db(engine):
    Session = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = Session()
    yield session
    session.close()


@pytest.fixture()
def client(engine, db):
    """TestClient wired to the same session the test uses.

    Intentionally created without the context manager: entering it would run the
    app lifespan, which calls ``create_all`` against the configured PostgreSQL
    engine. Tests only need the routes, and the DB dependency is overridden here.
    """
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


# ───────────────────────────── Data helpers ─────────────────────────────

@pytest.fixture()
def admin(db) -> User:
    u = User(
        name="Админ", email="admin@test.kg", password_hash=hash_password("x"),
        role=Role.admin, position="Руководитель", is_founder=True, is_active=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def staff(db) -> User:
    u = User(
        name="Сеттер", email="setter@test.kg", password_hash=hash_password("x"),
        role=Role.staff, position="Сеттер", is_active=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def other_staff(db) -> User:
    u = User(
        name="Другой", email="other@test.kg", password_hash=hash_password("x"),
        role=Role.staff, position="Клоузер", is_active=True,
    )
    db.add(u)
    db.commit()
    return u


@pytest.fixture()
def stages(db) -> dict[str, LeadStage]:
    rows = [
        LeadStage(name="Новый лид", position=0),
        LeadStage(name="Созвон", position=1),
        LeadStage(name="Встреча", position=2),
        LeadStage(name="Договор", position=3),
        LeadStage(name="Ожидание оплаты", position=4),
        LeadStage(name="Оплачено", position=5, is_won=True),
        LeadStage(name="Минус", position=6, is_lost=True),
    ]
    for r in rows:
        db.add(r)
    db.commit()
    return {r.name: r for r in rows}


@pytest.fixture()
def lead(db, stages, staff, other_staff) -> Lead:
    l = Lead(
        client_name="Клиент", company_name="ООО Тест", phone="+996 700 000001",
        stage_id=stages["Договор"].id, setter_id=staff.id, closer_id=other_staff.id,
        status=LeadStatus.active,
    )
    db.add(l)
    db.commit()
    return l


@pytest.fixture()
def deal(db, lead) -> Deal:
    d = Deal(lead_id=lead.id, amount=100_000, paid_amount=0, status="pending")
    db.add(d)
    db.commit()
    return d


@pytest.fixture()
def account(db) -> Account:
    a = Account(name="Банк", currency="сом", position=0)
    db.add(a)
    db.commit()
    return a


@pytest.fixture()
def personal_board(db, staff) -> Board:
    b = Board(name="Личный трекер", kind="personal", owner_id=staff.id)
    db.add(b)
    db.flush()
    for i, (name, is_done) in enumerate([("To-do", False), ("In progress", False), ("Done", True)]):
        db.add(BoardColumn(board_id=b.id, name=name, position=i, is_done=is_done))
    db.commit()
    return b


def auth_headers(user: User) -> dict[str, str]:
    from app.core.security import create_access_token
    return {"Authorization": f"Bearer {create_access_token(user.id)}"}
