"""Avatar upload validation and lead attribution fields."""
import io

import pytest

from app.services import media
from tests.conftest import auth_headers


def _png_bytes(size=(64, 40)) -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_bytes() -> bytes:
    from PIL import Image
    buf = io.BytesIO()
    Image.new("RGB", (50, 50), (200, 30, 30)).save(buf, format="JPEG")
    return buf.getvalue()


# ─────────────────────────── Content validation ─────────────────────────

def test_sniffs_real_type_from_magic_bytes():
    assert media.sniff_mime(_png_bytes()) == "image/png"
    assert media.sniff_mime(_jpeg_bytes()) == "image/jpeg"
    assert media.sniff_mime(b"not an image at all") is None


def test_rejects_non_image_content_even_with_image_mime():
    """A declared Content-Type is never trusted on its own."""
    with pytest.raises(media.InvalidImage):
        media.process_avatar(b"<?php system($_GET[0]); ?>", "image/png")


def test_rejects_oversized_file(monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "MAX_AVATAR_BYTES", 100)
    with pytest.raises(media.InvalidImage):
        media.process_avatar(_png_bytes(), "image/png")


def test_rejects_empty_file():
    with pytest.raises(media.InvalidImage):
        media.process_avatar(b"", "image/png")


def test_normalises_to_a_square_webp():
    data, ext = media.process_avatar(_png_bytes(size=(200, 80)), "image/png")
    assert ext == "webp"

    from PIL import Image
    img = Image.open(io.BytesIO(data))
    assert img.size == (media.AVATAR_SIZE, media.AVATAR_SIZE), "preview must be square"
    assert img.format == "WEBP"


def test_filename_is_server_generated():
    name = media.safe_filename(7, "webp")
    assert name.startswith("7_") and name.endswith(".webp")
    assert "/" not in name and ".." not in name


def test_delete_ignores_paths_outside_media_root(tmp_path):
    # Traversal attempts must not touch anything.
    media.delete_avatar("/etc/passwd")
    media.delete_avatar("../../etc/passwd")


# ───────────────────────────── Upload endpoint ──────────────────────────

def test_user_can_upload_and_remove_own_avatar(client, db, staff):
    h = auth_headers(staff)
    r = client.post(
        f"/api/users/{staff.id}/avatar",
        files={"file": ("me.png", _png_bytes(), "image/png")},
        headers=h,
    )
    assert r.status_code == 200, r.text
    url = r.json()["avatar_url"]
    assert url.startswith("/media/avatars/")

    r = client.delete(f"/api/users/{staff.id}/avatar", headers=h)
    assert r.status_code == 200
    assert r.json()["avatar_url"] == "", "falls back to initials + colour"


def test_staff_cannot_change_another_users_avatar(client, db, staff, other_staff):
    r = client.post(
        f"/api/users/{other_staff.id}/avatar",
        files={"file": ("x.png", _png_bytes(), "image/png")},
        headers=auth_headers(staff),
    )
    assert r.status_code == 403


def test_admin_can_change_an_employee_avatar(client, db, admin, staff):
    r = client.post(
        f"/api/users/{staff.id}/avatar",
        files={"file": ("x.png", _png_bytes(), "image/png")},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200


def test_upload_rejects_disguised_file(client, db, staff):
    r = client.post(
        f"/api/users/{staff.id}/avatar",
        files={"file": ("evil.png", b"MZ\x90\x00 not an image", "image/png")},
        headers=auth_headers(staff),
    )
    assert r.status_code == 422


def test_avatar_url_is_exposed_in_user_schemas(client, db, staff):
    r = client.get(f"/api/users/{staff.id}", headers=auth_headers(staff))
    assert r.status_code == 200
    assert "avatar_url" in r.json()


# ──────────────────────────── Lead attribution ──────────────────────────

def test_attribution_fields_round_trip(client, db, admin, stages):
    payload = {
        "client_name": "Реклама Лид",
        "phone": "+996 555 010101",
        "deal_amount": 50_000,
        "source_detail": "Reels про кейс",
        "content_ref": "https://instagram.com/reel/ABC123",
        "utm_source": "instagram",
        "utm_medium": "cpc",
        "utm_campaign": "august_leadgen",
        "utm_content": "creative_7",
        "external_lead_id": "meta-lead-999",
    }
    r = client.post("/api/leads", json=payload, headers=auth_headers(admin))
    assert r.status_code == 201, r.text
    body = r.json()
    for key, value in payload.items():
        if key in ("deal_amount", "client_name", "phone"):
            continue
        assert body[key] == value

    # Deal.amount is the canonical amount; the money view is derived from it.
    assert body["deal_amount"] == 50_000
    assert body["paid_amount"] == 0
    assert body["remaining_amount"] == 50_000
    assert body["deal_status"] == "pending"


def test_duplicate_external_lead_id_is_rejected(client, db, admin, stages):
    base = {"client_name": "A", "external_lead_id": "meta-1"}
    assert client.post("/api/leads", json=base, headers=auth_headers(admin)).status_code == 201
    r = client.post(
        "/api/leads",
        json={"client_name": "B", "external_lead_id": "meta-1"},
        headers=auth_headers(admin),
    )
    assert r.status_code == 409


def test_search_matches_content_ref_and_campaign(client, db, admin, stages):
    client.post(
        "/api/leads",
        json={
            "client_name": "Из рилса", "content_ref": "reel/XYZ789",
            "utm_campaign": "spring_promo",
        },
        headers=auth_headers(admin),
    )
    h = auth_headers(admin)

    assert client.get("/api/leads?search=XYZ789", headers=h).json()["total"] == 1
    assert client.get("/api/leads?search=spring_promo", headers=h).json()["total"] == 1


def test_updating_deal_amount_goes_through_the_deal(client, db, admin, lead, deal):
    r = client.patch(
        f"/api/leads/{lead.id}",
        json={"deal_amount": 250_000},
        headers=auth_headers(admin),
    )
    assert r.status_code == 200, r.text
    assert r.json()["deal_amount"] == 250_000

    db.refresh(deal)
    assert deal.amount == 250_000
    # The deprecated mirror stays in sync for legacy readers.
    db.refresh(lead)
    assert lead.potential_amount == 250_000
