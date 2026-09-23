"""Trivy JSON parser — covers vulnerabilities (OS + language packages),
secrets, and misconfigurations emitted by `trivy ... -f json`.
"""
from __future__ import annotations

import json
from typing import List

from .base import (
    ParsedFinding, ParseResult, normalize_cwe, normalize_severity,
    severity_from_cvss,
)

SCANNER = "Trivy"
DEFAULT_SCAN_TYPE = "Image Scan"
FORMAT = "JSON"


def _cvss_score(vuln: dict):
    cvss = vuln.get("CVSS") or {}
    # Prefer NVD, then RedHat, then any vendor present.
    for vendor in ("nvd", "redhat"):
        node = cvss.get(vendor) or {}
        score = node.get("V3Score") or node.get("V2Score")
        if score is not None:
            return score
    for node in cvss.values():
        if isinstance(node, dict):
            score = node.get("V3Score") or node.get("V2Score")
            if score is not None:
                return score
    return None


def _parse_vulnerability(vuln: dict, target: str) -> ParsedFinding:
    vuln_id = vuln.get("VulnerabilityID", "")
    pkg = vuln.get("PkgName", "")
    installed = vuln.get("InstalledVersion", "")
    fixed = vuln.get("FixedVersion")

    raw_sev = vuln.get("Severity")
    severity = normalize_severity(raw_sev)
    if severity == "info":
        severity = severity_from_cvss(_cvss_score(vuln))

    title = vuln.get("Title") or f"{vuln_id} in {pkg} {installed}".strip()
    cwe = None
    cwe_ids = vuln.get("CweIDs") or []
    if cwe_ids:
        cwe = normalize_cwe(cwe_ids[0])

    remediation = None
    if fixed:
        remediation = f"Upgrade {pkg} to {fixed}."

    desc_parts = []
    if pkg:
        desc_parts.append(f"Package: {pkg} {installed}")
    if target:
        desc_parts.append(f"Target: {target}")
    if vuln.get("Description"):
        desc_parts.append(vuln["Description"])

    return ParsedFinding(
        title=title,
        severity=severity,
        file_path=target or pkg or None,
        cwe=cwe,
        cve=vuln_id if str(vuln_id).startswith("CVE-") else None,
        description="\n\n".join(desc_parts),
        remediation=remediation,
        unique_id=f"{vuln_id}:{pkg}:{installed}:{target}",
        references=vuln.get("References", []) or [],
    )


def _parse_secret(secret: dict, target: str) -> ParsedFinding:
    rule_id = secret.get("RuleID", "")
    title = secret.get("Title") or f"Secret: {rule_id}"
    return ParsedFinding(
        title=title,
        severity=normalize_severity(secret.get("Severity")),
        file_path=target or None,
        line_number=secret.get("StartLine"),
        description=(secret.get("Match") or "").strip(),
        remediation="Remove the secret from source control and rotate the credential.",
        unique_id=f"secret:{rule_id}:{target}:{secret.get('StartLine')}",
    )


def _parse_misconfig(mc: dict, target: str) -> ParsedFinding:
    mc_id = mc.get("ID", "")
    cause = (mc.get("CauseMetadata") or {})
    return ParsedFinding(
        title=mc.get("Title") or f"Misconfiguration: {mc_id}",
        severity=normalize_severity(mc.get("Severity")),
        file_path=target or None,
        line_number=cause.get("StartLine"),
        description=mc.get("Description") or "",
        remediation=mc.get("Resolution"),
        unique_id=f"misconfig:{mc_id}:{target}",
        references=mc.get("References", []) or [],
    )


def parse(content: bytes) -> ParseResult:
    data = json.loads(content.decode("utf-8", "replace"))
    # Trivy schema v2 nests under "Results"; older output is a bare list.
    if isinstance(data, dict):
        results = data.get("Results") or []
    elif isinstance(data, list):
        results = data
    else:
        results = []

    findings: List[ParsedFinding] = []
    for res in results:
        target = res.get("Target", "") if isinstance(res, dict) else ""
        for vuln in (res.get("Vulnerabilities") or []):
            findings.append(_parse_vulnerability(vuln, target))
        for secret in (res.get("Secrets") or []):
            findings.append(_parse_secret(secret, target))
        for mc in (res.get("Misconfigurations") or []):
            findings.append(_parse_misconfig(mc, target))

    return ParseResult(
        findings=[f.normalized() for f in findings],
        scanner=SCANNER,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
