"""SARIF 2.1.0 parser — used by MegaLinter, CodeQL, Semgrep, and many others."""
from __future__ import annotations

import json
import re
from typing import Dict, List, Optional

from .base import (
    ParsedFinding, ParseResult, normalize_cwe, normalize_severity,
    severity_from_cvss,
)

SCANNER = "SARIF"
DEFAULT_SCAN_TYPE = "SAST"
FORMAT = "SARIF"

# SARIF result.level → canonical severity (fallback when no CVSS present)
_LEVEL = {"error": "high", "warning": "medium", "note": "low", "none": "info"}
_CWE_TAG_RE = re.compile(r"cwe[-_/](\d+)", re.IGNORECASE)


def _index_rules(driver: dict) -> Dict[str, dict]:
    rules = {}
    for rule in (driver.get("rules") or []):
        rid = rule.get("id")
        if rid:
            rules[rid] = rule
    return rules


def _rule_severity(rule: dict, result_level: Optional[str]) -> str:
    props = rule.get("properties") or {}
    # GitHub-style numeric CVSS-like score, if present.
    sec = props.get("security-severity")
    if sec is not None:
        try:
            return severity_from_cvss(float(sec))
        except (TypeError, ValueError):
            pass
    # A qualitative property some tools set.
    for key in ("problem.severity", "severity"):
        if props.get(key):
            return normalize_severity(props[key])
    level = result_level or (rule.get("defaultConfiguration") or {}).get("level")
    return _LEVEL.get((level or "").lower(), "info")


def _rule_cwe(rule: dict) -> Optional[str]:
    props = rule.get("properties") or {}
    for tag in (props.get("tags") or []):
        m = _CWE_TAG_RE.search(str(tag))
        if m:
            return normalize_cwe(m.group(1))
    return None


def _rule_text(rule: dict, key: str) -> str:
    node = rule.get(key)
    if isinstance(node, dict):
        return (node.get("text") or "").strip()
    return ""


def parse(content: bytes) -> ParseResult:
    data = json.loads(content.decode("utf-8", "replace"))
    findings: List[ParsedFinding] = []
    tool_name = SCANNER

    for run in (data.get("runs") or []):
        driver = ((run.get("tool") or {}).get("driver") or {})
        tool_name = driver.get("name") or tool_name
        rules = _index_rules(driver)

        for result in (run.get("results") or []):
            rule_id = result.get("ruleId") or ""
            rule = rules.get(rule_id, {})
            # ruleIndex is the canonical fallback link to the rule table.
            if not rule and isinstance(result.get("ruleIndex"), int):
                rule_list = driver.get("rules") or []
                idx = result["ruleIndex"]
                if 0 <= idx < len(rule_list):
                    rule = rule_list[idx]

            message = (result.get("message") or {}).get("text") or ""
            title = message.split("\n")[0].strip() or _rule_text(rule, "shortDescription") or rule_id or "SARIF finding"

            file_path = None
            line_number = None
            locations = result.get("locations") or []
            if locations:
                phys = (locations[0].get("physicalLocation") or {})
                file_path = (phys.get("artifactLocation") or {}).get("uri")
                line_number = (phys.get("region") or {}).get("startLine")

            description = message or _rule_text(rule, "fullDescription") or _rule_text(rule, "shortDescription")
            help_text = _rule_text(rule, "help")

            findings.append(ParsedFinding(
                title=title,
                severity=_rule_severity(rule, result.get("level")),
                file_path=file_path,
                line_number=line_number,
                cwe=_rule_cwe(rule),
                description=description,
                remediation=help_text or None,
                unique_id=f"sarif:{rule_id}:{file_path}:{line_number}" if rule_id else None,
            ).normalized())

    return ParseResult(
        findings=findings,
        scanner=tool_name,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
