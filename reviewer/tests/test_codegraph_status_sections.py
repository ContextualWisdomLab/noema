"""Contracts for provenance boundaries around CodeGraph collection."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.github_io import _fetch_codegraph_status
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build otherwise-complete strict evidence around one CodeGraph status."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=1,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_collector_labels_semantic_explore_output_for_every_caller() -> None:
    """The collector, not one CLI adapter, owns semantic-output provenance."""

    def runner(args, source_root):
        del source_root
        if "init" in args:
            return "initialized"
        if "sync" in args:
            return "synced"
        if "status" in args:
            return "Index is up to date"
        if "explore" in args:
            return "x.py -> validate_token -> GitHub token boundary"
        raise AssertionError(args)

    status = _fetch_codegraph_status("/target", ["x.py"], runner)

    assert "## codegraph explore\nx.py -> validate_token -> GitHub token boundary" in status
    assert missing_evidence(_manifest(status)) == []


def test_unlabelled_manifest_output_is_not_strict_review_evidence() -> None:
    """Externally supplied raw concatenation cannot impersonate explore evidence."""
    manifest = _manifest(
        "initialized\nsynced\nIndex is up to date\n"
        "x.py -> validate_token -> GitHub token boundary"
    )

    assert missing_evidence(manifest) == [
        "CodeGraph semantic query produced no review context"
    ]
