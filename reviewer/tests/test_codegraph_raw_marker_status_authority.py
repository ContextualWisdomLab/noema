"""Regression coverage for neutralized raw CodeGraph marker annotations."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build an otherwise-complete manifest for semantic-evidence tests."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=546,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_neutralized_raw_marker_plus_status_is_not_semantic_context() -> None:
    """A neutralized raw marker cannot turn a lifecycle banner into review evidence."""
    reasons = missing_evidence(
        _manifest(
            "## codegraph explore\n"
            "[raw CodeGraph explore marker]\n"
            "initialized"
        )
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]
