"""Regression tests for cross-field reviewer verdict invariants."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


def _finding(severity: Severity) -> Finding:
    """Build one concrete reviewer finding at the requested severity."""
    return Finding(
        severity=severity,
        path="src/example.py",
        evidence="current-head test evidence",
        recommendation="fix the defect",
    )


@pytest.mark.parametrize("severity", [Severity.MEDIUM, Severity.HIGH, Severity.CRITICAL])
def test_approval_rejects_blocking_findings(severity: Severity) -> None:
    """A publishable approval cannot carry a blocking-severity finding."""
    with pytest.raises(ValidationError):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="approve despite blocker",
            findings=[_finding(severity)],
        )


def test_approval_rejects_blocked_reasons() -> None:
    """An approval cannot simultaneously claim that evidence blocked a decision."""
    with pytest.raises(ValidationError):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="approve despite missing evidence",
            blocked_reasons=["missing current-head scanner evidence"],
        )


@pytest.mark.parametrize("severity", [Severity.LOW, Severity.INFO])
def test_approval_rejects_advisory_findings_too(severity: Severity) -> None:
    """Severity is descriptive evidence metadata, never a local admission
    threshold: LOW/INFO findings block approval exactly like MEDIUM/HIGH/
    CRITICAL findings (see noema_reviewer.models: "remove local severity
    admission thresholds")."""
    with pytest.raises(ValidationError, match="approval verdict cannot contain findings"):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="approve despite advisory finding",
            findings=[_finding(severity)],
        )


def test_request_changes_allows_blocking_finding() -> None:
    """A request-changes verdict may carry the blocking finding that justifies it."""
    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="blocking issue",
        findings=[_finding(Severity.HIGH)],
    )
    assert verdict.is_approval() is False
