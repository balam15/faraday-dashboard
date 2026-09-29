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

from models import Application, ImageTag, Scan, Finding, ScanSnapshot
from parsers.base import ParseResult

# Statuses set by a human that must survive a re-scan.
_TRIAGED = {"mitigated", "false_positive", "accepted"}

# How many import snapshots to keep per image tag (for the Analytics trend).
_SNAPSHOT_KEEP = 20


def _record_snapshot(db: Session, app: Application, image_tag: ImageTag) -> None:
    """Append a point-in-time snapshot of the tag's finding posture, then prune
    to the most recent ``_SNAPSHOT_KEEP`` rows for that tag. Lets the trend show
    progress across re-imports into the same tag (e.g. ``latest``)."""
    findings = [f for s in image_tag.scans for f in s.findings]
    sev = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    for f in findings:
        if f.severity in sev:
            sev[f.severity] += 1
    db.add(ScanSnapshot(
        application_id=app.id,
        image_tag_id=image_tag.id,
        tag=image_tag.tag,
        imported_at=datetime.utcnow(),
        total=len(findings),
        open=sum(1 for f in findings if f.status == "open"),
        mitigated=sum(1 for f in findings if f.status in _TRIAGED),
        critical=sev["critical"], high=sev["high"], medium=sev["medium"],
        low=sev["low"], info=sev["info"],
    ))
    db.flush()
    stale = (
        db.query(ScanSnapshot.id)
        .filter(ScanSnapshot.image_tag_id == image_tag.id)
        .order_by(ScanSnapshot.imported_at.desc(), ScanSnapshot.id.desc())
        .offset(_SNAPSHOT_KEEP)
        .all()
    )
    if stale:
        (
            db.query(ScanSnapshot)
            .filter(ScanSnapshot.id.in_([s[0] for s in stale]))
            .delete(synchronize_session=False)
        )


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

    # Snapshot the previous run of this scanner on this tag BEFORE deleting it,
    # so we can (a) carry over human triage and (b) auto-remediate findings that
    # are no longer reported.
    prior: Dict[str, dict] = {}
    prior_findings = (
        db.query(Finding)
        .join(Scan, Finding.scan_id == Scan.id)
        .filter(
            Scan.image_tag_id == image_tag.id,
            Scan.scanner == scanner,
            Scan.scan_type == scan_type,
        )
        .all()
    )
    for f in prior_findings:
        prior[f.dedup_hash] = {
            "title": f.title, "severity": f.severity, "file_path": f.file_path,
            "line_number": f.line_number, "cwe": f.cwe, "cve": f.cve,
            "description": f.description, "remediation": f.remediation,
            "status": f.status, "found_at": f.found_at,
        }
    is_reimport = len(prior_findings) > 0

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

    now = scanned_at or datetime.utcnow()
    scan = Scan(
        image_tag_id=image_tag.id,
        scanner=scanner,
        scan_type=scan_type,
        format=result.format,
        scanned_at=now,
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
        # Carry a human triage decision (mitigated/accepted/false_positive) over.
        prev = prior.get(h)
        status = prev["status"] if prev and prev["status"] in _TRIAGED else "open"
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
            status=status,
            found_at=now,
            dedup_hash=h,
        ))

    # Auto-remediate: findings present before but no longer reported are kept
    # and marked "mitigated" (unless a human already accepted / flagged them).
    if is_reimport:
        for h, prev in prior.items():
            if h in seen:
                continue
            status = prev["status"] if prev["status"] in ("false_positive", "accepted") else "mitigated"
            db.add(Finding(
                scan_id=scan.id,
                title=prev["title"],
                severity=prev["severity"],
                scanner=scanner,
                scan_type=scan_type,
                file_path=prev["file_path"],
                line_number=prev["line_number"],
                cwe=prev["cwe"],
                cve=prev["cve"],
                description=prev["description"] or "",
                remediation=prev["remediation"],
                status=status,
                found_at=prev["found_at"] or now,
                dedup_hash=h,
            ))

    db.commit()
    db.refresh(scan)

    # Preserve a history point for the Analytics trend, then persist.
    _record_snapshot(db, app, image_tag)
    db.commit()
    return scan
