"""Minimal SMTP notifier. Best-effort: never raises into the request path."""
from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from typing import Dict


def send_email(settings: Dict, subject: str, body: str) -> bool:
    """Send a plain-text email using the stored SMTP settings.

    Returns True on success. Silently returns False if SMTP isn't configured
    or sending fails — notifications must never break an import.
    """
    host = (settings.get("smtp_host") or "").strip()
    to_addr = (settings.get("notification_email") or "").strip()
    if not host or not to_addr:
        return False

    from_addr = (settings.get("smtp_from") or settings.get("smtp_user") or to_addr).strip()
    port = int(settings.get("smtp_port") or 587)
    user = (settings.get("smtp_user") or "").strip()
    password = settings.get("smtp_password") or ""
    use_tls = bool(settings.get("smtp_tls", True))

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to_addr
    msg.set_content(body)

    try:
        if port == 465:
            with smtplib.SMTP_SSL(host, port, timeout=15, context=ssl.create_default_context()) as s:
                if user:
                    s.login(user, password)
                s.send_message(msg)
        else:
            with smtplib.SMTP(host, port, timeout=15) as s:
                if use_tls:
                    s.starttls(context=ssl.create_default_context())
                if user:
                    s.login(user, password)
                s.send_message(msg)
        return True
    except Exception:
        return False
