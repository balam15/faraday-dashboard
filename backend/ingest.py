"""Persist a parsed scan into the database.

Handles: get-or-create Application + ImageTag, replace any prior run of the
same scanner on that tag, deduplicate findings within the scan, and carry
triage status (mitigated / false_positive / accepted) over from the previous
run of the same scanner so re-scans don't reset a human decision.
"""
from __future__ import annotations

from datetime import datetime
from typing import Dict, Optional

from sqlalchemy.orm import Session

from models import Application, ImageTag, Scan, Finding
from parsers.base import ParseResult

# Statuses set by a human that must survive a re-scan.
_TRIAGED = {"mitigated", "false_positive", "accepted"}


def get_or_create_application(
    db: Session, name: str, *, description: str = "", team: str = "",
    app_type: str = "service",
) -> Application:
    app = db.query(Application).filter(Application.name == name).first()
    if app:
        return app
    app = Application(
        name=name, description=description or "", team=team or "",
        type=app_type or "service",
    )
    db.add(app)
    db.flush()
    return app


def get_or_create_tag(
    db: Session, app: Application, tag: str, digest: Optional[str] = None,
) -> ImageTag:
    row = (
        db.query(ImageTag)
        .filter(ImageTag.application_id == app.id, ImageTag.tag == tag)
        .first()
    )
    if row:
        if digest and not row.digest:
            row.digest = digest
        return row
    row = ImageTag(application_id=app.id, tag=tag, digest=digest)
    db.add(row)
    db.flush()
    return row


def _prior_status_map(db: Session, image_tag_id: str, scanner: str) -> Dict[str, str]:
    """dedup_hash → triaged status, from the previous run of this scanner."""
    rows = (
        db.query(Finding.dedup_hash, Finding.status)
        .join(Scan, Finding.scan_id == Scan.id)
        .filter(Scan.image_tag_id == image_tag_id, Scan.scanner == scanner)
        .filter(Finding.status.in_(_TRIAGED))
        .all()
    )
    return {h: s for h, s in rows}


def persist_scan(
    db: Session,
    result: ParseResult,
    *,
    app_name: str,
    tag: str,
    digest: Optional[str] = None,
    scanned_at: Optional[datetime] = None,
    scanner_override: Optional[str] = None,
    scan_type_override: Optional[str] = None,
    app_type: str = "service",
    team: str = "",
) -> Scan:
    scanner = scanner_override or result.scanner
    scan_type = scan_type_override or result.scan_type

    app = get_or_create_application(db, app_name, team=team, app_type=app_type)
    image_tag = get_or_create_tag(db, app, tag, digest)

    carried = _prior_status_map(db, image_tag.id, scanner)

    # Replace any previous run of the same scanner on this tag (one row per
    # scanner+type per tag, matching how the UI lists scans).
    (
        db.query(Scan)
        .filter(
            Scan.image_tag_id == image_tag.id,
            Scan.scanner == scanner,
            Scan.scan_type == scan_type,
        )
        .delete(synchronize_session=False)
    )

    scan = Scan(
        image_tag_id=image_tag.id,
        scanner=scanner,
        scan_type=scan_type,
        format=result.format,
        scanned_at=scanned_at or datetime.utcnow(),
        imported_at=datetime.utcnow(),
        status="completed",
    )
    db.add(scan)
    db.flush()

    seen: set = set()
    for pf in result.findings:
        h = pf.dedup_hash(scanner)
        if h in seen:
            continue  # collapse duplicates within the same scan
        seen.add(h)
        db.add(Finding(
            scan_id=scan.id,
            title=pf.title,
            severity=pf.severity,
            scanner=scanner,
            scan_type=scan_type,
            file_path=pf.file_path,
            line_number=pf.line_number,
            cwe=pf.cwe,
            cve=pf.cve,
            description=pf.description or "",
            remediation=pf.remediation,
            status=carried.get(h, "open"),
            found_at=scanned_at or datetime.utcnow(),
            dedup_hash=h,
        ))

    db.commit()
    db.refresh(scan)
    return scan
