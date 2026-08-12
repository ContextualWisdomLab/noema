"""Regression tests for fail-closed observed check conclusions."""

from __future__ import annotations

import pytest

from noema_reviewer.gating import enforce_security_and_check_gates, failed_checks_as_review
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


def _manifest_with_check(name: str, conclusion: str) -> ReviewManifest:
    """Build complete reviewer evidence with one observed current-head check."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=171,
        diff="diff --git a/reviewer/a.py b/reviewer/a.py",
        changed_files=[ChangedFile(path="reviewer/a.py", content="value = 1\n")],
        check_conclusions=[CheckConclusion(name=name, conclusion=conclusion)],
        codegraph_status="Index is up to date",
    )


@pytest.mark.parametrize("conclusion", ["neutral", "skipped", "queued"])
def test_observed_non_success_check_cannot_preserve_approval(conclusion: str) -> None:
    """Every observed ordinary check must be terminal-success before approval."""
    manifest = _manifest_with_check("ci", conclusion)

    findings = failed_checks_as_review(manifest)
    assert len(findings) == 1
    assert conclusion in findings[0].evidence

    gated = enforce_security_and_check_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="model approved"),
    )
    assert gated.verdict is Verdict.REQUEST_CHANGES


def test_observed_success_check_remains_nonblocking() -> None:
    """An exact successful ordinary check remains compatible with approval."""
    manifest = _manifest_with_check("ci", "success")
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="model approved")

    assert failed_checks_as_review(manifest) == []
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.APPROVE


@pytest.mark.parametrize(
    "name",
    ["opencode-review", "metadata-only gate evaluation"],
)
def test_cycle_breaking_review_checks_remain_explicit_exceptions(name: str) -> None:
    """The two reviewer-cycle exceptions remain excluded even when non-successful."""
    manifest = _manifest_with_check(name, "skipped")
    verdict = ReviewVerdict(verdict=Verdict.APPROVE, summary="independent evidence passed")

    assert failed_checks_as_review(manifest) == []
    assert enforce_security_and_check_gates(manifest, verdict).verdict is Verdict.APPROVE
