"""Turn ORM rows into the exact JSON shapes the existing frontend expects.

The keys here mirror the TypeScript interfaces in ``src/lib/mock-data.ts``
(Application, ImageTag, ScanResult, Finding, SeverityCount) so the UI — and
its per-app diagrams — render unchanged.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Application, Finding, ImageTag, Scan, ScanSnapshot
import scoring

# Statuses that still count toward the risk score.
_OPEN = "open"


def iso(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    # Stored as naive UTC (datetime.utcnow); present as ISO 8601 with 'Z'.
    return dt.replace(microsecond=0).isoformat() + "Z"


def finding_dict(f: Finding) -> dict:
    return {
        "id": f.id,
        "title": f.title,
        "severity": f.severity,
        "scanner": f.scanner,
        "scanType": f.scan_type,
        "filePath": f.file_path,
        "lineNumber": f.line_number,
        "cwe": f.cwe,
        "cve": f.cve,
        "description": f.description or "",
        "remediation": f.remediation,
        "status": f.status,
        "foundAt": iso(f.found_at),
    }


def _counts(findings) -> dict:
    return scoring.count_severities(f.severity for f in findings)


def _open_counts(findings) -> dict:
    return scoring.count_severities(f.severity for f in findings if f.status == _OPEN)


# Finding statuses that count as "resolved" for the per-scan progress metric.
_RESOLVED = {"mitigated", "false_positive", "accepted"}


def scan_dict(s: Scan) -> dict:
    total = len(s.findings)
    resolved = sum(1 for f in s.findings if f.status in _RESOLVED)
    return {
        "id": s.id,
        "scanner": s.scanner,
        "scanType": s.scan_type,
        "format": s.format,
        "scannedAt": iso(s.scanned_at),
        "status": s.status,
        "findings": _counts(s.findings),
        "total": total,
        "resolved": resolved,
        "resolvedPct": round(100 * resolved / total) if total else 0,
    }


def snapshot_dict(s: ScanSnapshot) -> dict:
    return {
        "id": s.id,
        "tag": s.tag,
        "importedAt": iso(s.imported_at),
        "total": s.total,
        "open": s.open,
        "mitigated": s.mitigated,
        "findings": {
            "critical": s.critical,
            "high": s.high,
            "medium": s.medium,
            "low": s.low,
            "info": s.info,
        },
    }


def tag_dict(t: ImageTag) -> dict:
    all_findings = [f for s in t.scans for f in s.findings]
    total = _counts(all_findings)
    risk = scoring.risk_score(_open_counts(all_findings))
    return {
        "id": t.id,
        "tag": t.tag,
        "digest": t.digest,
        "createdAt": iso(t.created_at),
        "scans": [scan_dict(s) for s in t.scans],
        "totalFindings": total,
        "riskScore": risk,
    }


def application_dict(app: Application) -> dict:
    tags = [tag_dict(t) for t in app.image_tags]
    total = scoring.empty_counts()
    last_scanned = None
    max_risk = 0
    for t, raw in zip(app.image_tags, tags):
        total = scoring.add_counts(total, raw["totalFindings"])
        max_risk = max(max_risk, raw["riskScore"])
        for s in t.scans:
            if s.scanned_at and (last_scanned is None or s.scanned_at > last_scanned):
                last_scanned = s.scanned_at
    return {
        "id": app.id,
        "name": app.name,
        "description": app.description or "",
        "team": app.team or "",
        "type": app.type,
        "imageTags": tags,
        "lastScanned": iso(last_scanned) or iso(app.created_at),
        "riskScore": max_risk,
        "totalFindings": total,
    }


def applications_list(db: Session, allowed_names) -> list[dict]:
    """Efficient bulk build for GET /api/apps.

    Produces the same JSON shape as ``application_dict`` for each app, but
    computes every finding count with ONE grouped aggregate query instead of
    loading every Finding row — and selects plain columns so the ``selectin``
    relationships (which would eagerly load all scans/findings) never fire.

    ``allowed_names`` is None for full access, or an iterable of the application
    names the user may see.
    """
    app_q = db.query(
        Application.id, Application.name, Application.description,
        Application.team, Application.type, Application.created_at,
    )
    if allowed_names is not None:
        allowed = set(allowed_names)
        if not allowed:
            return []
        app_q = app_q.filter(Application.name.in_(allowed))
    app_rows = app_q.all()
    if not app_rows:
        return []
    app_ids = [a.id for a in app_rows]

    tag_rows = (
        db.query(ImageTag.id, ImageTag.application_id, ImageTag.tag,
                 ImageTag.digest, ImageTag.created_at)
        .filter(ImageTag.application_id.in_(app_ids))
        .all()
    )
    tag_ids = [t.id for t in tag_rows]

    scan_rows = (
        db.query(Scan.id, Scan.image_tag_id, Scan.scanner, Scan.scan_type,
                 Scan.format, Scan.scanned_at, Scan.status)
        .filter(Scan.image_tag_id.in_(tag_ids))
        .all()
        if tag_ids else []
    )
    scan_ids = [s.id for s in scan_rows]

    # Single grouped aggregate: counts per (scan, severity, status).
    sev_by_scan: dict = {}
    open_by_scan: dict = {}
    total_by_scan: dict = {}
    resolved_by_scan: dict = {}
    if scan_ids:
        agg = (
            db.query(Finding.scan_id, Finding.severity, Finding.status, func.count().label("n"))
            .filter(Finding.scan_id.in_(scan_ids))
            .group_by(Finding.scan_id, Finding.severity, Finding.status)
            .all()
        )
        for scan_id, severity, status, n in agg:
            sev = sev_by_scan.setdefault(scan_id, scoring.empty_counts())
            if severity in sev:
                sev[severity] += n
            total_by_scan[scan_id] = total_by_scan.get(scan_id, 0) + n
            if status in _RESOLVED:
                resolved_by_scan[scan_id] = resolved_by_scan.get(scan_id, 0) + n
            if status == _OPEN:
                op = open_by_scan.setdefault(scan_id, scoring.empty_counts())
                if severity in op:
                    op[severity] += n

    scans_grouped: dict = {}
    for s in scan_rows:
        scans_grouped.setdefault(s.image_tag_id, []).append(s)

    tags_by_app: dict = {}
    for t in tag_rows:
        scan_dicts = []
        tag_total = scoring.empty_counts()
        tag_open = scoring.empty_counts()
        last_scanned = None
        for s in scans_grouped.get(t.id, []):
            sev = sev_by_scan.get(s.id, scoring.empty_counts())
            total = total_by_scan.get(s.id, 0)
            resolved = resolved_by_scan.get(s.id, 0)
            scan_dicts.append({
                "id": s.id,
                "scanner": s.scanner,
                "scanType": s.scan_type,
                "format": s.format,
                "scannedAt": iso(s.scanned_at),
                "status": s.status,
                "findings": sev,
                "total": total,
                "resolved": resolved,
                "resolvedPct": round(100 * resolved / total) if total else 0,
            })
            tag_total = scoring.add_counts(tag_total, sev)
            tag_open = scoring.add_counts(tag_open, open_by_scan.get(s.id, scoring.empty_counts()))
            if s.scanned_at and (last_scanned is None or s.scanned_at > last_scanned):
                last_scanned = s.scanned_at
        tags_by_app.setdefault(t.application_id, []).append({
            "dict": {
                "id": t.id,
                "tag": t.tag,
                "digest": t.digest,
                "createdAt": iso(t.created_at),
                "scans": scan_dicts,
                "totalFindings": tag_total,
                "riskScore": scoring.risk_score(tag_open),
            },
            "last_scanned": last_scanned,
        })

    out = []
    for a in app_rows:
        total = scoring.empty_counts()
        max_risk = 0
        last_scanned = None
        image_tags = []
        for te in tags_by_app.get(a.id, []):
            td = te["dict"]
            total = scoring.add_counts(total, td["totalFindings"])
            max_risk = max(max_risk, td["riskScore"])
            if te["last_scanned"] and (last_scanned is None or te["last_scanned"] > last_scanned):
                last_scanned = te["last_scanned"]
            image_tags.append(td)
        out.append({
            "id": a.id,
            "name": a.name,
            "description": a.description or "",
            "team": a.team or "",
            "type": a.type,
            "imageTags": image_tags,
            "lastScanned": iso(last_scanned) or iso(a.created_at),
            "riskScore": max_risk,
            "totalFindings": total,
        })
    return out
