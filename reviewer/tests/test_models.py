"""Tests for the verdict schema."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from noema_reviewer.models import Finding, ReviewVerdict, Severity, Verdict


def _finding(severity: Severity) -> Finding:
    """Build one evidence-backed finding at the requested severity."""
    return Finding(
        severity=severity,
        path="src/x.py",
        evidence="test log",
        recommendation="fix it",
    )


def test_is_approval_true_only_for_approve() -> None:
    """is_approval reflects the verdict enum value."""
    approve = ReviewVerdict(verdict=Verdict.APPROVE, summary="ok")
    changes = ReviewVerdict(verdict=Verdict.REQUEST_CHANGES, summary="no")
    assert approve.is_approval() is True
    assert changes.is_approval() is False


def test_verdict_defaults_are_evidence_only() -> None:
    """The publishable verdict carries evidence, not a model-confidence heuristic."""
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="fine")
    assert verdict.findings == []
    assert verdict.blocked_reasons == []
    assert verdict.suggested_patch_ref is None
    assert "confidence" not in ReviewVerdict.model_fields
    assert "confidence" not in verdict.model_dump()


@pytest.mark.parametrize("severity", list(Severity))
def test_approval_rejects_every_evidence_backed_finding(severity: Severity) -> None:
    """No unresolved finding may coexist with an approval, regardless of severity."""
    with pytest.raises(ValidationError, match="approval verdict cannot contain findings"):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="must fail",
            findings=[_finding(severity)],
        )


def test_approval_rejects_blocked_reasons() -> None:
    """An approval cannot carry missing-evidence reasons."""
    with pytest.raises(ValidationError, match="approval verdict cannot contain blocked reasons"):
        ReviewVerdict(
            verdict=Verdict.APPROVE,
            summary="must fail",
            blocked_reasons=["missing current check evidence"],
        )


def test_finding_roundtrips_optional_line() -> None:
    """A finding keeps an optional line and required evidence/recommendation."""
    finding = _finding(Severity.HIGH)
    assert finding.line is None
    dumped = finding.model_dump()
    assert dumped["severity"] == "high"
