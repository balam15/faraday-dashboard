"""Fortify SCA parser.

Accepts either a raw ``audit.fvdl`` XML document or a ``.fpr`` archive
(a zip that contains ``audit.fvdl``). The FVDL is namespaced XML; we strip
namespaces so navigation stays readable.
"""
from __future__ import annotations

import html
import io
import re
import zipfile
from typing import Dict, List, Optional
from xml.etree import ElementTree as ET

from .base import ParsedFinding, ParseResult, normalize_cwe

SCANNER = "Fortify"
DEFAULT_SCAN_TYPE = "SAST"
FORMAT = "FPR"

_TAG_RE = re.compile(r"<[^>]+>")
_CWE_RE = re.compile(r"CWE[\s-]?(?:ID[\s-]?)?(\d+)", re.IGNORECASE)


def _localname(tag: str) -> str:
    return tag.split("}", 1)[-1] if "}" in tag else tag


def _strip_ns(root: ET.Element) -> ET.Element:
    for el in root.iter():
        el.tag = _localname(el.tag)
        el.attrib = {_localname(k): v for k, v in el.attrib.items()}
    return root


def _inner_text(el: Optional[ET.Element]) -> str:
    if el is None:
        return ""
    text = "".join(el.itertext())
    # Fortify FVDL stores its HTML descriptions escaped inside the XML. After
    # ElementTree's own decode, real formatting tags (from single-escaped
    # markup like "&lt;p&gt;") appear as tags and are stripped here. Code
    # examples are double-escaped ("&amp;lt;project&amp;gt;") and survive as
    # "&lt;project&gt;", so unescape once more to render them as readable
    # "<project>" instead of leaking raw entities into the UI.
    text = _TAG_RE.sub("", text)
    text = html.unescape(text)
    # Collapse the whitespace ElementTree leaves behind while keeping line
    # breaks so multi-line recommendations/examples stay readable.
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"[ \t]*\n[ \t]*", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _severity_from_float(value: Optional[str]) -> str:
    try:
        s = float(value)
    except (TypeError, ValueError):
        return "medium"
    if s >= 4.0:
        return "critical"
    if s >= 3.0:
        return "high"
    if s >= 2.0:
        return "medium"
    return "low"


def _extract_fvdl(content: bytes) -> bytes:
    # A .fpr is a zip archive; a raw .fvdl starts with '<'.
    if content[:2] == b"PK":
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            # audit.fvdl is at the archive root in standard FPRs.
            name = next(
                (n for n in zf.namelist() if n.lower().endswith("audit.fvdl")),
                None,
            )
            if name is None:
                name = next((n for n in zf.namelist() if n.lower().endswith(".fvdl")), None)
            if name is None:
                raise ValueError("No audit.fvdl found inside the FPR archive")
            return zf.read(name)
    return content


def _build_descriptions(root: ET.Element) -> Dict[str, Dict[str, str]]:
    """classID → {abstract, explanation, recommendations}."""
    out: Dict[str, Dict[str, str]] = {}
    for desc in root.iter("Description"):
        class_id = desc.attrib.get("classID")
        if not class_id:
            continue
        out[class_id] = {
            "abstract": _inner_text(desc.find("Abstract")),
            "explanation": _inner_text(desc.find("Explanation")),
            "recommendations": _inner_text(desc.find("Recommendations")),
        }
    return out


def _priority_from_metainfo(inst_info: Optional[ET.Element]) -> Optional[str]:
    if inst_info is None:
        return None
    meta = inst_info.find("MetaInfo")
    if meta is None:
        return None
    for group in meta.findall("Group"):
        if "priority" in (group.attrib.get("name", "").lower()):
            return (group.text or "").strip() or None
    return None


def _metainfo_group(inst_info: Optional[ET.Element], name: str) -> Optional[str]:
    """Read a named MetaInfo Group (e.g. Impact, Probability, Accuracy)."""
    if inst_info is None:
        return None
    meta = inst_info.find("MetaInfo")
    if meta is None:
        return None
    for group in meta.findall("Group"):
        if (group.attrib.get("name", "") or "").lower() == name.lower():
            return (group.text or "").strip() or None
    return None


def _find_source_location(vuln: ET.Element):
    """Return (path, line) of the last (sink) SourceLocation, if any."""
    path = line = None
    for sl in vuln.iter("SourceLocation"):
        path = sl.attrib.get("path", path)
        raw_line = sl.attrib.get("line")
        if raw_line and raw_line.isdigit():
            line = int(raw_line)
    return path, line


def parse(content: bytes) -> ParseResult:
    fvdl = _extract_fvdl(content)
    root = _strip_ns(ET.fromstring(fvdl))
    descriptions = _build_descriptions(root)

    findings: List[ParsedFinding] = []
    for vuln in root.iter("Vulnerability"):
        class_info = vuln.find("ClassInfo")
        inst_info = vuln.find("InstanceInfo")
        if class_info is None:
            continue

        class_id = _inner_text(class_info.find("ClassID"))
        vtype = _inner_text(class_info.find("Type"))
        subtype = _inner_text(class_info.find("Subtype"))
        title = " - ".join([p for p in (vtype, subtype) if p]) or "Fortify finding"

        # Prefer the audited priority; fall back to the numeric severity.
        priority = _priority_from_metainfo(inst_info)
        if priority:
            severity = priority  # normalized below
        else:
            inst_sev = _inner_text(inst_info.find("InstanceSeverity")) if inst_info is not None else None
            default_sev = _inner_text(class_info.find("DefaultSeverity"))
            severity = _severity_from_float(inst_sev or default_sev)

        path, line = _find_source_location(vuln)

        desc = descriptions.get(class_id, {})
        description = desc.get("abstract") or desc.get("explanation") or ""
        remediation = desc.get("recommendations") or None

        cwe = None
        m = _CWE_RE.search(desc.get("explanation", "")) or _CWE_RE.search(subtype)
        if m:
            cwe = normalize_cwe(m.group(1))

        instance_id = _inner_text(inst_info.find("InstanceID")) if inst_info is not None else None

        # Impact + severity justification from Fortify's instance metadata.
        impact = _metainfo_group(inst_info, "Impact")
        conf = _inner_text(inst_info.find("Confidence")) if inst_info is not None else ""
        just_bits = []
        if conf:
            just_bits.append(f"Confidence: {conf}")
        for g in ("Probability", "Accuracy"):
            v = _metainfo_group(inst_info, g)
            if v:
                just_bits.append(f"{g}: {v}")
        severity_justification = " · ".join(just_bits) or None

        findings.append(ParsedFinding(
            title=title,
            severity=severity,
            file_path=path,
            line_number=line,
            cwe=cwe,
            description=description,
            remediation=remediation,
            impact=impact,
            severity_justification=severity_justification,
            unique_id=f"fortify:{instance_id}" if instance_id else f"fortify:{class_id}:{path}:{line}",
        ).normalized())

    return ParseResult(
        findings=findings,
        scanner=SCANNER,
        scan_type=DEFAULT_SCAN_TYPE,
        format=FORMAT,
    )
