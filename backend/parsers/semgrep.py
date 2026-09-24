"""Semgrep native JSON parser (`semgrep scan --json`).

This is the format DefectDojo calls "Semgrep JSON Report" — distinct from
SARIF. Findings live under `results[]`.
"""
from __future__ import annotations

import json
from typing import List, Optional

from .base import ParsedFinding, ParseResult, normalize_cwe

SCANNER = "Semgrep"
DEFAULT_SCAN_TYPE = "SAST"
FORMAT = "JSON"

# Semgrep severities → canonical (matches the company pipeline's mapping).
_SEV = {
    "critical": "critical",
    "error": "high",
    "high": "high",
    "warning": "medium",
    "medium": "medium",
    "info": "low",
    "low": "low",
}


def _severity(raw: Optional[str]) -> str:
    return _SEV.get(str(raw or "").strip().lower(), "low")


def _cwe(meta: dict) -> Optional[str]:
    cwe = meta.get("cwe")
    if isinstance(cwe, list) and cwe:
        cwe = cwe[0]
    return normalize_cwe(cwe) if cwe else None


def parse(content: bytes) -> ParseResult:
    data = json.loads(content.decode("utf-8", "replace"))
    findings: List[ParsedFinding] = []

    for r in (data.get("results") or []):
        check_id = r.get("check_id", "")
        extra = r.get("extra") or {}
        meta = extra.get("metadata") or {}
        path = r.get("path")
        line = (r.get("start") or {}).get("line")

        message = extra.get("message") or check_id or "Semgrep finding"
        title = (str(check_id).split(".")[-1] or message).strip()

        refs = meta.get("references") or []
        cve = None
        # Some rules carry a CVE in metadata.
        raw_cve = meta.get("cve")
        if isinstance(raw_cve, list) and raw_cve:
            cve = raw_cve[0]
        elif isinstance(raw_cve, str):
            cve = raw_cve

        findings.append(ParsedFinding(
            title=title or "Semgrep finding",
            severity=_severity(extra.get("severity")),
            file_path=path,
            line_number=line if isinstance(line, int) else None,
            cwe=_cwe(meta),
            cve=cve,
            description=str(message),
            remediation=(extra.get("fix") or meta.get("remediation") or None),
            unique_id=f"semgrep:{check_id}:{path}:{line}" if check_id else None,
            references=refs if isinstance(refs, list) else [],
        ).normalized())

    return ParseResult(
        findings=findings,
        scanner=SCANNER,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
