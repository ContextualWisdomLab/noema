"""Fail-closed contracts for semantic CodeGraph review evidence."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build the smallest otherwise-complete manifest for CodeGraph gate tests."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=1,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_no_relevant_code_is_missing_semantic_evidence() -> None:
    """An empty CodeGraph semantic result must block strict reviewer evidence."""
    reasons = missing_evidence(
        _manifest('No relevant code found for "Review current-head changed files"')
    )

    assert reasons == ["CodeGraph semantic query returned no relevant code"]
