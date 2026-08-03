"""Avatar upload handling: real content validation + normalisation.

Files are written to a persistent media volume and served as static files —
never base64 in the database.
"""
from __future__ import annotations

import io
import os
import secrets
from pathlib import Path

from app.core.config import settings

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
# Magic-number prefixes — the declared Content-Type is never trusted on its own.
_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
]
AVATAR_SIZE = 512  # normalised square side, px


class InvalidImage(ValueError):
    """Uploaded bytes are not an accepted image."""


def avatars_dir() -> Path:
    path = Path(settings.MEDIA_ROOT) / "avatars"
    path.mkdir(parents=True, exist_ok=True)
    return path


def sniff_mime(data: bytes) -> str | None:
    """Detect the real image type from the file's magic bytes."""
    for prefix, mime in _SIGNATURES:
        if data.startswith(prefix):
            return mime
    # WebP: "RIFF" .... "WEBP"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def process_avatar(data: bytes, declared_mime: str | None = None) -> tuple[bytes, str]:
    """Validate and normalise an avatar. Returns (bytes, file extension).

    Normalisation: centre-cropped to a square, resized to AVATAR_SIZE, re-encoded
    as WebP. Re-encoding also strips EXIF and any smuggled payload.
    """
    if not data:
        raise InvalidImage("Файл пуст")
    if len(data) > settings.MAX_AVATAR_BYTES:
        mb = settings.MAX_AVATAR_BYTES // (1024 * 1024)
        raise InvalidImage(f"Файл больше {mb} МБ")

    real_mime = sniff_mime(data)
    if real_mime not in ALLOWED_MIME:
        raise InvalidImage("Поддерживаются только JPEG, PNG и WebP")
    if declared_mime and declared_mime.split(";")[0].strip().lower() not in ALLOWED_MIME:
        raise InvalidImage("Недопустимый тип файла")

    try:
        from PIL import Image
    except ImportError as exc:  # pragma: no cover - dependency is pinned
        raise InvalidImage("Обработка изображений недоступна на сервере") from exc

    try:
        img = Image.open(io.BytesIO(data))
        img.verify()               # structural check
        img = Image.open(io.BytesIO(data))  # verify() exhausts the file object
        img = img.convert("RGB")
    except InvalidImage:
        raise
    except Exception as exc:
        raise InvalidImage("Файл не является корректным изображением") from exc

    # Centre-crop to a square so the preview is never distorted.
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side))
    img = img.resize((AVATAR_SIZE, AVATAR_SIZE))

    out = io.BytesIO()
    img.save(out, format="WEBP", quality=88, method=4)
    return out.getvalue(), "webp"


def safe_filename(user_id: int, ext: str) -> str:
    """Server-generated name — user-supplied filenames are never used."""
    return f"{int(user_id)}_{secrets.token_hex(8)}.{ext}"


def save_avatar(user_id: int, data: bytes, declared_mime: str | None = None) -> str:
    """Persist a normalised avatar and return its public URL path."""
    payload, ext = process_avatar(data, declared_mime)
    name = safe_filename(user_id, ext)
    (avatars_dir() / name).write_bytes(payload)
    return f"{settings.MEDIA_URL_PREFIX}/avatars/{name}"


def delete_avatar(url: str) -> None:
    """Remove a previously stored avatar file. Ignores anything outside MEDIA_ROOT."""
    if not url:
        return
    prefix = f"{settings.MEDIA_URL_PREFIX}/avatars/"
    if not url.startswith(prefix):
        return
    name = os.path.basename(url[len(prefix):])
    target = (avatars_dir() / name).resolve()
    try:
        # Path containment check — never delete outside the avatars directory.
        target.relative_to(avatars_dir().resolve())
    except ValueError:
        return
    if target.is_file():
        target.unlink(missing_ok=True)
