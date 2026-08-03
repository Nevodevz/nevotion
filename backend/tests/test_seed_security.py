import pytest

from app.seed import _initial_user_password


def test_production_seed_requires_initial_password(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.delenv("INITIAL_USER_PASSWORD", raising=False)

    with pytest.raises(RuntimeError, match="INITIAL_USER_PASSWORD"):
        _initial_user_password()


def test_seed_uses_password_from_environment(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("INITIAL_USER_PASSWORD", "generated-deployment-secret")

    assert _initial_user_password() == "generated-deployment-secret"


def test_development_seed_keeps_local_fallback(monkeypatch):
    monkeypatch.setenv("ENVIRONMENT", "development")
    monkeypatch.delenv("INITIAL_USER_PASSWORD", raising=False)

    assert _initial_user_password() == "Nevo2026!"
