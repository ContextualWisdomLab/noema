"""Tests for the verdict schema."""

from __future__ import annotations

from noema_reviewer.models import (
    BLOCKING_SEVERITIES,
    Confidence,
    Finding,
    ReviewVerdict,
    Severity,
    Verdict,
)


def test_blocking_severities_are_medium_and_up() -> None:
    """MEDIUM, HIGH, and CRITICAL block an approval; LOW and INFO do not."""
    assert set(BLOCKING_SEVERITIES) == {Severity.CRITICAL, Severity.HIGH, Severity.MEDIUM}
    assert Severity.LOW not in BLOCKING_SEVERITIES
    assert Severity.INFO not in BLOCKING_SEVERITIES


def test_is_approval_true_only_for_approve() -> None:
    """is_approval reflects the verdict enum value."""
    approve = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    changes = ReviewVerdict(verdict=Verdict.REQUEST_CHANGES, summary="no")
    assert approve.is_approval() is True
    assert changes.is_approval() is False


def test_verdict_defaults() -> None:
    """A minimal verdict carries empty finding lists and medium confidence."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="fine")
    assert verdict.findings == []
    assert verdict.blocked_reasons == []
    assert verdict.confidence is Confidence.MEDIUM
    assert verdict.suggested_patch_ref is None


def test_finding_roundtrips_optional_line() -> None:
    """A finding keeps an optional line and required evidence/recommendation."""
    finding = Finding(
        severity=Severity.HIGH,
        path="src/x.py",
        evidence="test log",
        recommendation="fix it",
    )
    assert finding.line is None
    dumped = finding.model_dump()
    assert dumped["severity"] == "high"
