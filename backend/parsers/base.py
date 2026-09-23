"""Shared parser primitives: severity normalisation, the ParsedFinding
container, and the stable dedup fingerprint every parser feeds into.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import List, Optional

# Canonical severity levels used everywhere in the app (matches the frontend).
SEVERITIES = ("critical", "high", "medium", "low", "info")

# Maps the many labels scanners emit onto our five canonical levels.
_SEVERITY_ALIASES = {
    "critical": "critical",
    "crit": "critical",
    "blocker": "critical",
    "high": "high",
    "important": "high",
    "error": "high",
    "moderate": "medium",
    "medium": "medium",
    "med": "medium",
    "warning": "medium",
    "warn": "medium",
    "low": "low",
    "minor": "low",
    "note": "low",
    "info": "info",
    "informational": "info",
    "information": "info",
    "unknown": "info",
    "none": "info",
    "negligible": "info",
}


def normalize_severity(raw: Optional[str]) -> str:
    """Return one of SEVERITIES for whatever a scanner reported."""
    if raw is None:
        return "info"
    key = str(raw).strip().lower()
    return _SEVERITY_ALIASES.get(key, "info")


def severity_from_cvss(score: Optional[float]) -> str:
    """CVSS v3 base score → qualitative severity (used when no label given)."""
    if score is None:
        return "info"
    try:
        s = float(score)
    except (TypeError, ValueError):
        return "info"
    if s >= 9.0:
        return "critical"
    if s >= 7.0:
        return "high"
    if s >= 4.0:
        return "medium"
    if s > 0.0:
        return "low"
    return "info"


_CWE_RE = re.compile(r"CWE[-_ ]?(\d+)", re.IGNORECASE)


def normalize_cwe(raw) -> Optional[str]:
    """Coerce a CWE reference (int, 'CWE-79', '79', ...) to 'CWE-79'."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return f"CWE-{raw}"
    m = _CWE_RE.search(str(raw))
    if m:
        return f"CWE-{m.group(1)}"
    digits = str(raw).strip()
    return f"CWE-{digits}" if digits.isdigit() else None


@dataclass
class ParsedFinding:
    """A scanner-agnostic finding, ready to be persisted as a Finding row."""
    title: str
    severity: str = "info"
    file_path: Optional[str] = None
    line_number: Optional[int] = None
    cwe: Optional[str] = None
    cve: Optional[str] = None
    description: str = ""
    remediation: Optional[str] = None
    # The scanner's own stable id for this finding, if it exposes one
    # (e.g. a CVE, a ZAP pluginid, a SARIF ruleId). Strengthens dedup.
    unique_id: Optional[str] = None
    references: List[str] = field(default_factory=list)

    def normalized(self) -> "ParsedFinding":
        self.severity = normalize_severity(self.severity)
        self.cwe = normalize_cwe(self.cwe)
        if not self.title:
            self.title = "Untitled finding"
        self.title = self.title.strip()[:512]
        return self

    def dedup_hash(self, scanner: str) -> str:
        """Stable fingerprint. Two findings with the same fingerprint are
        considered "the same issue" across re-scans, so their triage status
        can carry over. Prefer the tool's unique id; otherwise fall back to
        the semantic fields that identify the issue.
        """
        if self.unique_id:
            basis = f"{scanner}|uid|{self.unique_id}"
        else:
            basis = "|".join([
                scanner,
                self.title.lower().strip(),
                self.cwe or "",
                self.cve or "",
                (self.file_path or "").lower(),
                str(self.line_number or ""),
            ])
        return hashlib.sha256(basis.encode("utf-8", "replace")).hexdigest()


@dataclass
class ParseResult:
    """What a parser returns: the findings plus metadata about the run."""
    findings: List[ParsedFinding]
    scanner: str
    scan_type: str          # SAST | DAST | Image Scan | SCA | Secrets
    format: str             # JSON | SARIF | XML | FPR
