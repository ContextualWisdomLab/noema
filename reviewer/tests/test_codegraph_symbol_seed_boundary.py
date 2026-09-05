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


def test_symbol_seed_scope_token_budget_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """An oversized whitespace scope cannot trigger repository path probes."""
    calls: list[list[str]] = []
    scope = " ".join(f"file-{index}" for index in range(cli.MAX_CODEGRAPH_CHANGED_SCOPE_TOKENS + 1))
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        f"for these current-head changed files: {scope}"
    )

    def fake_runner(args, _source_root):
        calls.append(list(args))
        return 'No relevant code found for "oversized path scope"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], "/target")

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore"]


def test_symbol_seed_missing_long_candidate_stays_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """A long candidate absent from the current head cannot trigger a symbol probe."""
    calls: list[list[str]] = []
    token = "x" * 160
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        f"for these current-head changed files: {token} {token}"
    )

    def fake_runner(args, _source_root):
        calls.append(list(args))
        return 'No relevant code found for "missing long candidate path"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], "/target")

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore"]


def test_symbol_seed_filesystem_probe_budget_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    """Whitespace ambiguity cannot drive unbounded current-head filesystem probes."""
    token_count = 92
    scope = " ".join(f"file-{index}" for index in range(token_count))
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        f"for these current-head changed files: {scope}"
    )
    probes = 0

    def fake_regular_file(_source_root: str, candidate: str) -> bool:
        nonlocal probes
        probes += 1
        return " " not in candidate

    monkeypatch.setattr(cli, "_is_current_head_regular_file", fake_regular_file)

    assert token_count <= cli.MAX_CODEGRAPH_CHANGED_SCOPE_TOKENS
    assert cli._codegraph_changed_paths(query, "/target") == []
    assert probes == cli.MAX_CODEGRAPH_CHANGED_SCOPE_PATH_PROBES


@pytest.mark.parametrize(
    "relative_path",
    [
        "src/line\nbreak.ts",
        "src/tab\tbreak.ts",
        "src/repeated  spaces.ts",
        " leading.ts",
        "trailing.ts ",
    ],
)
def test_changed_path_recovery_preserves_exact_whitespace_bytes(
    tmp_path: Path,
    relative_path: str,
) -> None:
    """Path recovery must not normalize whitespace that is part of a current-head filename."""
    target = tmp_path / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("symbol\n", encoding="utf-8")
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        f"for these current-head changed files: {relative_path}"
    )

    assert cli._codegraph_changed_paths(query, str(tmp_path)) == [relative_path]
