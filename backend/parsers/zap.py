"""OWASP ZAP XML report parser (`<OWASPZAPReport>`)."""
from __future__ import annotations

import html
import re
from typing import List, Optional
from xml.etree import ElementTree as ET

from .base import ParsedFinding, ParseResult, normalize_cwe

SCANNER = "OWASP ZAP"
DEFAULT_SCAN_TYPE = "DAST"
FORMAT = "XML"

# ZAP riskcode → canonical severity
_RISKCODE = {"0": "info", "1": "low", "2": "medium", "3": "high"}

_TAG_RE = re.compile(r"<[^>]+>")


def _text(el: Optional[ET.Element], tag: str) -> str:
    if el is None:
        return ""
    child = el.find(tag)
    return (child.text or "").strip() if child is not None and child.text else ""


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    return html.unescape(_TAG_RE.sub("", raw)).strip()


def parse(content: bytes) -> ParseResult:
    root = ET.fromstring(content)
    findings: List[ParsedFinding] = []

    # Alerts live under each <site>/<alerts>/<alertitem>.
    for alertitem in root.iter("alertitem"):
        name = _text(alertitem, "alert") or _text(alertitem, "name")
        riskcode = _text(alertitem, "riskcode")
        severity = _RISKCODE.get(riskcode, "info")

        cweid = _text(alertitem, "cweid")
        pluginid = _text(alertitem, "pluginid")
        desc = _strip_html(_text(alertitem, "desc"))
        solution = _strip_html(_text(alertitem, "solution"))

        # First affected URL, if present.
        uri = None
        instances = alertitem.find("instances")
        if instances is not None:
            first = instances.find("instance")
            if first is not None:
                uri = _text(first, "uri") or None
        if uri is None:
            uri = _text(alertitem, "uri") or None

        findings.append(ParsedFinding(
            title=name or "ZAP alert",
            severity=severity,
            file_path=uri,
            cwe=normalize_cwe(cweid) if cweid and cweid != "-1" else None,
            description=desc,
            remediation=solution or None,
            unique_id=f"zap:{pluginid}:{uri}" if pluginid else None,
        ).normalized())

    return ParseResult(
        findings=findings,
        scanner=SCANNER,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
