"""Notification feed regression tests."""

from tests.conftest import auth_headers


def test_notifications_builds_bishkek_day_window(client, admin):
    response = client.get("/api/notifications", headers=auth_headers(admin))

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["count"] == len(payload["items"])
