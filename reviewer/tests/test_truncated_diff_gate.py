"""Regression tests for fail-closed handling of bounded pull-request diffs."""

from __future__ import annotations

from noema_reviewer.gating import apply_gates, missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest
from noema_reviewer.models import ReviewVerdict, Verdict


def _truncated_manifest() -> ReviewManifest:
    """Build otherwise-complete evidence whose unified diff exceeded its budget."""
    return ReviewManifest(
        repo="ContextualWisdomLab/example",
        pr_number=1,
        diff="diff --git a/a.py b/a.py",
        diff_truncated=True,
        changed_files=[ChangedFile(path="a.py", content="print('bounded context')")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status="Index is up to date",
    )


def test_strict_review_blocks_when_pull_request_diff_is_truncated() -> None:
    """A bounded partial diff is missing evidence, never approval-grade evidence."""
    manifest = _truncated_manifest()

    assert missing_evidence(manifest) == ["pull request diff was truncated"]

    verdict = apply_gates(
        manifest,
        ReviewVerdict(verdict=Verdict.APPROVE, summary="looks complete"),
        strict=True,
    )
    assert verdict.verdict is Verdict.BLOCKED
    assert verdict.blocked_reasons == ["pull request diff was truncated"]
