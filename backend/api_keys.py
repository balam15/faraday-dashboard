"""API key generation and verification for CI/CD scan imports.

A key looks like ``frd_live_<43 url-safe chars>``. Only its SHA-256 hash is
stored; the plaintext is shown to the user exactly once, at creation.
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from models import ApiKey

_PREFIX = "frd_live_"


def _hash(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def generate(db: Session, name: str, created_by: Optional[str] = None) -> Tuple[ApiKey, str]:
    """Create a key. Returns (row, plaintext_key). Store nothing but the hash."""
    secret = secrets.token_urlsafe(32)
    full_key = f"{_PREFIX}{secret}"
    row = ApiKey(
        name=name,
        prefix=f"{_PREFIX}{secret[:4]}",
        key_hash=_hash(full_key),
        created_by=created_by,
        is_active=True,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, full_key


def verify(db: Session, presented: str) -> Optional[ApiKey]:
    if not presented or not presented.startswith(_PREFIX):
        return None
    row = (
        db.query(ApiKey)
        .filter(ApiKey.key_hash == _hash(presented), ApiKey.is_active.is_(True))
        .first()
    )
    if row:
        row.last_used = datetime.utcnow()
        db.commit()
    return row
