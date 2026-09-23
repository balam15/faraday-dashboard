"""Parser registry.

Each entry maps a public ``scan_type`` key (what the import API accepts,
kept close to DefectDojo's naming) to a callable ``parse(content: bytes)``
that returns a :class:`ParseResult`.
"""
from __future__ import annotations

from typing import Callable, Dict, List

from . import fortify, sarif, trivy, zap
from .base import ParsedFinding, ParseResult

# Public key → parse function
_REGISTRY: Dict[str, Callable[[bytes], ParseResult]] = {
    "Trivy Scan": trivy.parse,
    "ZAP Scan": zap.parse,
    "SARIF": sarif.parse,
    "Fortify Scan": fortify.parse,
}

# Friendly aliases so callers can be a little loose.
_ALIASES = {
    "trivy": "Trivy Scan",
    "zap": "ZAP Scan",
    "owasp zap": "ZAP Scan",
    "sarif": "SARIF",
    "megalinter": "SARIF",
    "codeql": "SARIF",
    "semgrep": "SARIF",
    "fortify": "Fortify Scan",
}


def available_scan_types() -> List[str]:
    return list(_REGISTRY.keys())


def resolve_key(scan_type: str) -> str:
    if scan_type in _REGISTRY:
        return scan_type
    alias = _ALIASES.get(scan_type.strip().lower())
    if alias:
        return alias
    raise KeyError(scan_type)


def detect(content: bytes) -> str:
    """Best-effort guess of the parser key from the file contents."""
    head = content[:4096].lstrip()
    if content[:2] == b"PK":
        return "Fortify Scan"          # .fpr archive
    if head[:1] == b"<":
        low = head.lower()
        if b"owaspzapreport" in low:
            return "ZAP Scan"
        if b"fvdl" in low or b"fortify" in low:
            return "Fortify Scan"
        raise ValueError("Unrecognised XML report")
    if head[:1] in (b"{", b"["):
        low = head.lower()
        if b'"$schema"' in low and b"sarif" in low or b'"runs"' in low:
            return "SARIF"
        if b"schemaversion" in low or b"vulnerabilities" in low or b"results" in low:
            return "Trivy Scan"
    raise ValueError("Could not auto-detect scan format; specify scan_type")


def parse(content: bytes, scan_type: str = None) -> ParseResult:
    """Parse ``content`` with the named parser, or auto-detect when omitted."""
    key = resolve_key(scan_type) if scan_type else detect(content)
    return _REGISTRY[key](content)


__all__ = [
    "ParsedFinding", "ParseResult",
    "available_scan_types", "resolve_key", "detect", "parse",
]
