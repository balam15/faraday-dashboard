"""Persisted system settings (Security + Notifications).

Stored as a single JSON row in `system_config` (key = "app_settings"), so no
extra table/migration is needed. `get_settings` always returns defaults merged
with whatever is saved.
"""
from __future__ import annotations

import json
from typing import Any, Dict

from sqlalchemy.orm import Session

from models import SystemConfig

_KEY = "app_settings"

DEFAULTS: Dict[str, Any] = {
    # ── Security ──
    "session_timeout_minutes": 480,   # JWT / cookie lifetime
    "max_login_attempts": 5,          # 0 disables lockout
    "lockout_minutes": 15,            # how long an account stays locked
    "audit_logging": True,            # record the activity feed
    "force_https": False,             # mark the session cookie Secure
    # ── Notifications ──
    "notify_new_critical": True,
    "notify_new_high": True,
    "notify_scan_completed": False,
    "notify_weekly_summary": True,
    "notification_email": "",
    # ── SMTP (for notifications) ──
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
    "smtp_tls": True,
}

# Keys that must never be returned to the client.
_SECRET_KEYS = {"smtp_password"}


def get_settings(db: Session) -> Dict[str, Any]:
    row = db.query(SystemConfig).filter(SystemConfig.key == _KEY).first()
    saved: Dict[str, Any] = {}
    if row and row.value:
        try:
            saved = json.loads(row.value) or {}
        except (ValueError, TypeError):
            saved = {}
    return {**DEFAULTS, **saved}


def public_settings(db: Session) -> Dict[str, Any]:
    """Settings safe to send to the browser (secrets masked)."""
    data = get_settings(db)
    for k in _SECRET_KEYS:
        # Report only whether a value is set, never the value itself.
        data[f"{k}_set"] = bool(data.get(k))
        data.pop(k, None)
    return data


def save_settings(db: Session, updates: Dict[str, Any]) -> Dict[str, Any]:
    current = get_settings(db)
    for key, value in (updates or {}).items():
        if key not in DEFAULTS:
            continue  # ignore unknown keys
        # Don't overwrite a stored secret with an empty value.
        if key in _SECRET_KEYS and (value is None or value == ""):
            continue
        current[key] = value
    row = db.query(SystemConfig).filter(SystemConfig.key == _KEY).first()
    if not row:
        row = SystemConfig(key=_KEY, value=json.dumps(current))
        db.add(row)
    else:
        row.value = json.dumps(current)
    db.commit()
    return current
