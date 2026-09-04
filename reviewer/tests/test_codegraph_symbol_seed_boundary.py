"""Fail-closed path-boundary coverage for CodeGraph retrieval seeding."""

from __future__ import annotations

import pytest

from noema_reviewer import cli


def test_missing_current_head_path_is_not_probed_as_a_symbol_seed(monkeypatch: pytest.MonkeyPatch) -> None:
    """A query token that is not a current-head file cannot seed semantic recovery."""
    calls: list[list[str]] = []
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: src/deleted.ts"
    )

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node":
            return "**Symbols**\n- staleDeletedSymbol"
        return 'No relevant code found for "path-only query"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], "/target")

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore"]
