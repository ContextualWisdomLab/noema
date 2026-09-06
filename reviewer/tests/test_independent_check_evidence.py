"""Regression coverage for independent current-head check evidence."""

from __future__ import annotations

from noema_reviewer.gating import apply_gates, missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


def _review_dependent_only_manifest() -> ReviewManifest:
    """Build complete review evidence whose checks are all reviewer-dependent."""
    return ReviewManifest(
        repo="o/r",
        pr_number=1,
        diff="diff --git a/a b/a",
        changed_files=[ChangedFile(path="a", content="x")],
        check_conclusions=[
            CheckConclusion(name="noema-review", conclusion="pending"),
            CheckConclusion(name="opencode-review", conclusion="pending"),
            CheckConclusion(name="metadata-only gate evaluation", conclusion="pending"),
        ],
        codegraph_status="## codegraph explore\na -> b",
    )


def test_strict_review_requires_independent_current_head_check_evidence() -> None:
    """Reviewer-dependent checks alone cannot satisfy strict current-head evidence."""
    manifest = _review_dependent_only_manifest()

    assert missing_evidence(manifest) == ["missing independent current-head check conclusions"]

    verdict = apply_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="model approved"),
        strict=True,
    )
    assert verdict.verdict is Verdict.BLOCKED
    assert verdict.blocked_reasons == ["missing independent current-head check conclusions"]
