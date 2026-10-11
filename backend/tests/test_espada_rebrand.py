import hashlib
import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy.orm import sessionmaker

from app.models import ApiKey, Board, Department, User
from app.seed import _find_seed_user, seed_espadalabs
from conftest import auth_headers


def _branding_migration():
    path = Path(__file__).resolve().parents[1] / "migrations/versions/020_espada_branding.py"
    spec = importlib.util.spec_from_file_location("espada_branding", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.parametrize("customized", [False, True])
def test_branding_migration_keeps_identity_and_membership(db, staff, customized):
    migration = _branding_migration()
    name = "Наш R&D" if customized else "NevoLabs"
    content = "Наш собственный текст" if customized else migration.LEGACY_ABOUT
    labs = Department(name=name, slug="nevolabs", kind="nevolabs", members=[staff])
    about = Department(name="О компании", slug="about", kind="about", content=content)
    db.add_all([labs, about])
    db.flush()
    board = Board(name="R&D queue", kind="lab_project", department_id=labs.id)
    db.add(board)
    db.commit()
    identity = (labs.id, board.id, staff.email)

    with Operations.context(MigrationContext.configure(db.connection())):
        migration.upgrade()
    db.expire_all()
    assert (labs.id, board.id, staff.email) == identity
    assert labs.slug == labs.kind == "espadalabs"
    assert labs.name == (name if customized else "Espada Labs")
    assert [member.id for member in labs.members] == [staff.id]
    assert board.department_id == labs.id
    assert about.content == (content if customized else migration.ESPADA_ABOUT)

    with Operations.context(MigrationContext.configure(db.connection())):
        migration.downgrade()
    db.expire_all()
    assert labs.slug == labs.kind == "nevolabs"
    assert labs.name == name
    assert about.content == content
    assert [member.id for member in labs.members] == [staff.id]


def test_existing_department_urls_and_permissions_still_work(client, db, staff):
    from app.routers.boards import _can_view_board
    from app.routers.lab_projects import _can_manage

    labs = Department(name="Espada Labs", slug="espadalabs", kind="espadalabs", members=[staff])
    db.add(labs)
    db.commit()
    for slug in ("nevolabs", "espadalabs"):
        response = client.get(f"/api/departments/{slug}", headers=auth_headers(staff))
        assert response.status_code == 200
        assert response.json()["id"] == labs.id
    assert _can_manage(staff, db)
    assert _can_view_board(staff, Board(name="R&D", kind="lab_project"), db)


def test_new_keys_use_espada_prefix_and_legacy_keys_still_authenticate(client, db, staff):
    created = client.post("/api/api-keys", json={"name": "Espada test"}, headers=auth_headers(staff))
    assert created.status_code == 201
    assert created.json()["plain_key"].startswith("esp_")

    legacy_key = "nvo_existing-key"
    row = ApiKey(
        user_id=staff.id, name="Existing integration",
        key_hash=hashlib.sha256(legacy_key.encode()).hexdigest(), key_prefix=legacy_key[:12],
    )
    db.add(row)
    db.commit()
    for key in (created.json()["plain_key"], legacy_key):
        response = client.get("/api/auth/me", headers={"X-API-Key": key})
        assert response.status_code == 200
        assert response.json()["id"] == staff.id
    client.delete(f"/api/api-keys/{row.id}", headers=auth_headers(staff))
    assert client.get("/api/auth/me", headers={"X-API-Key": legacy_key}).status_code == 401


def test_seed_keeps_existing_employee_login_and_labs_membership(db, engine, monkeypatch):
    import app.seed as seed_module

    erbol = User(name="Эрбол", email="erbol@nevodevs.kg", password_hash="unchanged", position="Тимлид")
    atif = User(name="Атиф", email="abdulatif.works@gmail.com", password_hash="unchanged", position="Легенда")
    labs = Department(name="Espada Labs", slug="espadalabs", kind="espadalabs")
    db.add_all([erbol, atif, labs])
    db.commit()
    assert _find_seed_user(db, "erbol").id == erbol.id
    monkeypatch.setattr(seed_module, "SessionLocal", sessionmaker(bind=engine))
    seed_espadalabs()
    seed_espadalabs()
    assert db.query(User).count() == 2
    assert db.query(Department).count() == 1
    db.expire_all()
    assert {member.id for member in labs.members} == {erbol.id, atif.id}
    assert erbol.email == "erbol@nevodevs.kg"
    assert erbol.password_hash == "unchanged"
