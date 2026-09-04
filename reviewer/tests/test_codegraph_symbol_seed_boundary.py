"""Fail-closed path-boundary coverage for CodeGraph retrieval seeding."""

from __future__ import annotations

from pathlib import Path

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


def test_ambiguous_whitespace_scope_cannot_collapse_changed_paths_into_unrelated_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """Lost path boundaries must fail closed instead of seeding an unchanged lookalike path."""
    for relative_path in ("alpha", "beta", "alpha beta"):
        target = tmp_path / relative_path
        target.write_text("symbol\n", encoding="utf-8")

    calls: list[list[str]] = []
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: alpha beta"
    )

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node":
            return "**Symbols**\n- unrelatedLookalike"
        return 'No relevant code found for "path-only query"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], str(tmp_path))

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore"]
