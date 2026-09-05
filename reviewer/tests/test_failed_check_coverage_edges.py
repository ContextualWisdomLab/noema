"""Coverage contracts for reviewer fail-closed edge branches."""

from noema_reviewer.gating import invalid_suggestion_reasons
from noema_reviewer.github_io import _github_actions_job_id, render_review_body
from noema_reviewer.manifest import ChangedFile, ReviewManifest
from noema_reviewer.models import (
    EvidenceType,
    Finding,
    Priority,
    ReviewVerdict,
    Severity,
    Verdict,
)


def _finding(*, line: int = 1, suggested_diff: str | None = None) -> Finding:
    """Build one source-backed finding for rendering and anchoring edge tests."""
    return Finding(
        severity=Severity.HIGH,
        priority=Priority.P1,
        path="a.py",
        line=line,
        evidence="current-head evidence",
        evidence_type=EvidenceType.NEARBY_IMPLEMENTATION,
        observable_impact="The current-head behavior is incorrect.",
        trigger="Execute the affected path.",
        recommendation="Apply the bounded source repair.",
        regression_command="python -m pytest",
        suggested_diff=suggested_diff,
    )


def test_diff_metadata_line_terminates_right_side_anchor_sequence() -> None:
    """Unexpected diff metadata cannot leave a later suggestion line attachable."""
    manifest = ReviewManifest(
        repo="o/r",
        pr_number=1,
        diff=(
            "diff --git a/a.py b/a.py\n"
            "--- a/a.py\n"
            "+++ b/a.py\n"
            "@@ -1 +1,2 @@\n"
            "+first\n"
            "\\ No newline at end of file\n"
            "+second"
        ),
        changed_files=[ChangedFile(path="a.py", content="first\nsecond")],
    )

    verdict = ReviewVerdict(
        verdict=Verdict.REQUEST_CHANGES,
        summary="fix",
        findings=[_finding(line=2, suggested_diff="replacement")],
    )

    assert invalid_suggestion_reasons(manifest, verdict) == [
        "suggested diff is not anchored to a current-head right-side diff line: a.py:2"
    ]


def test_actions_job_id_rejects_non_https_github_url() -> None:
    """Only repository-bound HTTPS GitHub job URLs can authorize log retrieval."""
    assert _github_actions_job_id(
        "o/r",
        "http://github.com/o/r/actions/runs/1/job/2",
    ) is None


def test_review_body_renders_finding_without_inline_suggestion() -> None:
    """A source finding without a suggestion renders without inventing a patch block."""
    body = render_review_body(
        ReviewVerdict(
            verdict=Verdict.REQUEST_CHANGES,
            summary="current-head finding",
            findings=[_finding()],
        ),
        "a" * 40,
        "github-app",
    )

    assert "#### [P1] a.py:1" in body
    assert "```suggestion" not in body
