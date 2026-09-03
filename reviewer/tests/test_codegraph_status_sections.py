"""Compatibility contracts for the current CodeGraph evidence collector."""

from noema_reviewer.gating import missing_evidence
from noema_reviewer.github_io import _fetch_codegraph_status
from noema_reviewer.manifest import ChangedFile, CheckConclusion, ReviewManifest


def test_collected_explore_payload_remains_semantic_review_evidence() -> None:
    """The unlabelled collector must preserve enough changed-file context to pass safely."""

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
    manifest = ReviewManifest(
        repo="ContextualWisdomLab/noema",
        pr_number=1,
        diff="diff --git a/x.py b/x.py",
        changed_files=[ChangedFile(path="x.py", content="value = 1")],
        check_conclusions=[CheckConclusion(name="ci", conclusion="success")],
        codegraph_status=status,
    )

    assert "x.py -> validate_token -> GitHub token boundary" in status
    assert missing_evidence(manifest) == []
