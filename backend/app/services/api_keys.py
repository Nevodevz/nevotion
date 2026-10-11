import hashlib
import secrets
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import ApiKey, User


def _hash_key(plain: str) -> str:
    return hashlib.sha256(plain.encode()).hexdigest()


def generate_key() -> tuple[str, str, str]:
    """Return (plain_key, key_hash, key_prefix)."""
    random_part = secrets.token_urlsafe(32)
    plain = f"esp_{random_part}"
    key_hash = _hash_key(plain)
    prefix = plain[:12]
    return plain, key_hash, prefix


def verify_key(db: Session, plain: str) -> User | None:
    """Find user by API key. Updates last_used_at. Returns None if invalid/revoked."""
    key_hash = _hash_key(plain)
    api_key = db.query(ApiKey).filter(
        ApiKey.key_hash == key_hash,
        ApiKey.revoked == False,
    ).first()
    if not api_key:
        return None
    api_key.last_used_at = datetime.now(timezone.utc)
    db.commit()
    return db.get(User, api_key.user_id)
