"""SARIF 2.1.0 parser — used by MegaLinter, CodeQL, Semgrep, and many others."""
from __future__ import annotations

import html
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


_TAG_RE = re.compile(r"<[^>]+>")
_BLANKS_RE = re.compile(r"[ \t]*\n[ \t]*")


def _strip_html(text: str) -> str:
    """Render a rule's HTML/Markdown-ish text as readable plain text.

    MegaLinter rules often carry only ``fullDescription`` (frequently HTML),
    so when there's no ``help`` we fall back to it. Unescape entities, turn
    block tags into line breaks, drop the rest of the markup, and collapse
    the leftover whitespace while keeping paragraph breaks.
    """
    if not text:
        return ""
    # Block-level tags become newlines so paragraphs/lists stay separated.
    text = re.sub(r"(?i)<\s*br\s*/?>", "\n", text)
    text = re.sub(r"(?i)</\s*(p|div|li|ul|ol|h[1-6]|tr|blockquote)\s*>", "\n", text)
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    # Normalize whitespace: trim each line, drop runs of blank lines.
    text = _BLANKS_RE.sub("\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


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

            full_desc = _strip_html(_rule_text(rule, "fullDescription"))
            description = message or full_desc or _rule_text(rule, "shortDescription")
            # Remediation: prefer the rule's dedicated help text; when a linter
            # (e.g. MegaLinter) ships only fullDescription, fall back to it with
            # HTML stripped so the guidance still shows up in the finding — but
            # not when we already used fullDescription as the description above.
            help_text = _rule_text(rule, "help")
            if not help_text:
                # Some tools put the guidance in help.markdown instead of .text.
                help_node = rule.get("help")
                if isinstance(help_node, dict) and help_node.get("markdown"):
                    help_text = _strip_html(str(help_node["markdown"]))
            if not help_text and full_desc and description != full_desc:
                help_text = full_desc
            if not help_text:
                # Linters like hadolint/ruff ship only a helpUri (a link to the
                # rule's docs) — surface it so there's still actionable guidance.
                help_uri = rule.get("helpUri")
                if help_uri:
                    help_text = f"See rule documentation: {help_uri}"

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
