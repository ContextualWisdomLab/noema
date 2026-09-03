"""Contracts for provenance-labelled CodeGraph evidence sections."""

from noema_reviewer.github_io import _fetch_codegraph_status


def test_codegraph_status_labels_explore_payload() -> None:
    """Collected semantic output must be distinguishable from setup/status banners."""

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
