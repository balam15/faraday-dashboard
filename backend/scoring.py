"""Severity aggregation and risk scoring — the numbers the dashboard shows."""
from __future__ import annotations

from typing import Dict, Iterable

# Contribution of one finding at each severity to the 0–100 risk score.
_WEIGHTS = {"critical": 10.0, "high": 5.0, "medium": 2.0, "low": 0.5, "info": 0.0}


def empty_counts() -> Dict[str, int]:
    return {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}


def count_severities(severities: Iterable[str]) -> Dict[str, int]:
    counts = empty_counts()
    for sev in severities:
        if sev in counts:
            counts[sev] += 1
    return counts


def add_counts(a: Dict[str, int], b: Dict[str, int]) -> Dict[str, int]:
    return {k: a.get(k, 0) + b.get(k, 0) for k in empty_counts()}


def risk_score(counts: Dict[str, int]) -> int:
    """Weighted, capped 0–100. Only findings that are still open count."""
    raw = sum(_WEIGHTS[sev] * counts.get(sev, 0) for sev in _WEIGHTS)
    return min(100, round(raw))
