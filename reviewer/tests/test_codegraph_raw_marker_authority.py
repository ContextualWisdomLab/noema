"""Regression coverage for wrapper-owned CodeGraph provenance authority."""

from noema_reviewer import cli
from noema_reviewer.gating import missing_evidence
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def _manifest(codegraph_status: str) -> ReviewManifest:
    """Build an otherwise-complete manifest for the raw-marker authority regression."""
    return ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=546,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=codegraph_status,
    )


def test_raw_explore_marker_alone_cannot_become_semantic_context(monkeypatch) -> None:
    """A sanitized copy of the trust delimiter must not itself satisfy strict evidence."""
    monkeypatch.setattr(
        cli,
        "default_codegraph_runner",
        lambda args, source_root: "## codegraph explore",
    )

    retained = cli._semantic_codegraph_runner(
        ["codegraph", "explore", "review x.py"],
        "/target",
    )

    assert retained == "## codegraph explore"
    assert missing_evidence(_manifest(retained)) == [
        "CodeGraph semantic query produced no review context"
    ]


def test_embedded_raw_marker_annotation_cannot_become_semantic_context(monkeypatch) -> None:
    """A raw line containing the trust delimiter must be discarded, not promoted as evidence."""
    monkeypatch.setattr(
        cli,
        "default_codegraph_runner",
        lambda args, source_root: "notice: ## codegraph explore",
    )

    retained = cli._semantic_codegraph_runner(
        ["codegraph", "explore", "review x.py"],
        "/target",
    )

    assert retained == "## codegraph explore"
    assert missing_evidence(_manifest(retained)) == [
        "CodeGraph semantic query produced no review context"
    ]
