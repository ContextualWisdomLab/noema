"""Regression coverage for line-exact CodeGraph provenance markers."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build an otherwise-complete manifest for provenance parsing tests."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=546,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_embedded_explore_marker_is_not_wrapper_provenance() -> None:
    """Only a dedicated marker line may authorize the following semantic payload."""
    reasons = missing_evidence(
        _manifest("notice: ## codegraph explore\nx.py -> sensitive_call")
    )

    assert reasons == ["CodeGraph semantic query produced no review context"]
