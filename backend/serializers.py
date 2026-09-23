"""Turn ORM rows into the exact JSON shapes the existing frontend expects.

The keys here mirror the TypeScript interfaces in ``src/lib/mock-data.ts``
(Application, ImageTag, ScanResult, Finding, SeverityCount) so the UI — and
its per-app diagrams — render unchanged.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from models import Application, Finding, ImageTag, Scan
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


def scan_dict(s: Scan) -> dict:
    return {
        "id": s.id,
        "scanner": s.scanner,
        "scanType": s.scan_type,
        "format": s.format,
        "scannedAt": iso(s.scanned_at),
        "status": s.status,
        "findings": _counts(s.findings),
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
