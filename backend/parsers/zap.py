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
# ZAP confidence → label
_CONFIDENCE = {"0": "False Positive", "1": "Low", "2": "Medium", "3": "High", "4": "Confirmed"}

_TAG_RE = re.compile(r"<[^>]+>")
_URL_RE = re.compile(r"https?://[^\s<>\"')]+")


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
        otherinfo = _strip_html(_text(alertitem, "otherinfo"))
        confidence = _text(alertitem, "confidence")

        # References: the <reference> block is HTML holding one or more URLs.
        references = _URL_RE.findall(_text(alertitem, "reference") or "")

        # First affected URL + reproduction steps from each instance.
        uri = None
        steps_lines: List[str] = []
        instances = alertitem.find("instances")
        if instances is not None:
            for inst in instances.findall("instance"):
                inst_uri = _text(inst, "uri") or None
                if uri is None:
                    uri = inst_uri
                method = _text(inst, "method")
                param = _text(inst, "param")
                attack = _text(inst, "attack")
                evidence = _text(inst, "evidence")
                parts = []
                if method or inst_uri:
                    parts.append(f"{method} {inst_uri}".strip())
                if param:
                    parts.append(f"Parameter: {param}")
                if attack:
                    parts.append(f"Attack: {attack}")
                if evidence:
                    parts.append(f"Evidence: {evidence}")
                if parts:
                    steps_lines.append("\n".join(parts))
        if uri is None:
            uri = _text(alertitem, "uri") or None

        steps = "\n\n".join(steps_lines) or None
        conf_label = _CONFIDENCE.get(confidence)
        severity_justification = f"Confidence: {conf_label}" if conf_label else None

        findings.append(ParsedFinding(
            title=name or "ZAP alert",
            severity=severity,
            file_path=uri,
            cwe=normalize_cwe(cweid) if cweid and cweid != "-1" else None,
            description=desc,
            remediation=solution or None,
            impact=otherinfo or None,
            steps_to_reproduce=steps,
            severity_justification=severity_justification,
            unique_id=f"zap:{pluginid}:{uri}" if pluginid else None,
            references=references,
        ).normalized())

    return ParseResult(
        findings=findings,
        scanner=SCANNER,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
