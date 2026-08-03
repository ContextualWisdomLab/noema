"""Regression tests for fail-closed current-head signal gating."""

from __future__ import annotations

import pytest

from noema_reviewer.gating import failed_checks_as_review
from noema_reviewer.manifest import CheckConclusion, ReviewManifest


@pytest.mark.parametrize(
    "conclusion",
    ["pending", "stale", "unknown-provider-state", ""],
)
def test_every_nonpassing_check_run_conclusion_is_blocking(conclusion: str) -> None:
    """A current-head check run cannot be treated as passing by omission."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        check_conclusions=[
            CheckConclusion(
                name="build",
                conclusion=conclusion,
                source="check_run",
            )
        ],
    )

    findings = failed_checks_as_review(manifest)

    assert len(findings) == 1
    assert findings[0].path == ".github/checks/build"


@pytest.mark.parametrize(
    "conclusion",
    ["success", "SUCCESS", " neutral ", "skipped"],
)
def test_only_github_passing_conclusions_are_nonblocking(conclusion: str) -> None:
    """GitHub success, neutral, and skipped conclusions remain acceptable."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        check_conclusions=[
            CheckConclusion(
                name="build",
                conclusion=conclusion,
                source="check_run",
            )
        ],
    )

    assert failed_checks_as_review(manifest) == []


def test_pending_commit_status_is_blocking_with_provider_remediation() -> None:
    """A late pending legacy status cannot race a completed central wait."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        check_conclusions=[
            CheckConclusion(
                name="external-security",
                conclusion="pending",
                source="commit_status",
            )
        ],
    )

    finding = failed_checks_as_review(manifest)[0]

    assert finding.path == ".github/statuses/external-security"
    assert "commit status concluded pending" in finding.evidence
    assert "external status provider" in finding.recommendation


def test_pending_review_dependent_signal_remains_cycle_exempt() -> None:
    """The exact downstream review checks stay excluded even while pending."""
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        check_conclusions=[
            CheckConclusion(
                name="metadata-only gate evaluation",
                conclusion="pending",
                source="check_run",
            )
        ],
    )

    assert failed_checks_as_review(manifest) == []
