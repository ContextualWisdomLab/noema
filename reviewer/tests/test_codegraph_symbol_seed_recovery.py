"""Regression tests for bounded CodeGraph symbol-seeded explore recovery."""

from __future__ import annotations

import pytest

from noema_reviewer import cli


GENERIC_QUERY = (
    "Review blast radius, call paths, security boundaries, and focused tests "
    "for these current-head changed files: src/readiness.ts"
)


def test_path_only_miss_retries_with_indexed_symbol_map(monkeypatch: pytest.MonkeyPatch) -> None:
    """An indexed changed file can seed a second explore after a path-only miss."""
    calls: list[list[str]] = []

    def fake_runner(args, source_root):
        calls.append(list(args))
        assert source_root == "/target"
        if args[1] == "node":
            return "**Symbols**\n- commercialReadiness\n- evaluateCommercialReadiness"
        if "Indexed changed-file symbol maps" in args[2]:
            return "commercialReadiness -> evaluateCommercialReadiness"
        return 'No relevant code found for "Review blast radius ... src/readiness.ts"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", GENERIC_QUERY], "/target")

    assert result == "## codegraph explore\ncommercialReadiness -> evaluateCommercialReadiness"
    assert [call[1] for call in calls] == ["explore", "node", "explore"]
    assert calls[1][2:] == ["--file", "src/readiness.ts", "--symbols-only"]
    assert "**Symbols**" in calls[2][2]
    assert "retrieval seeds only" in calls[2][2]


def test_path_only_miss_stays_empty_without_indexed_symbols(monkeypatch: pytest.MonkeyPatch) -> None:
    """A changed file with no indexed symbol map must remain fail-closed evidence."""
    calls: list[list[str]] = []

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node":
            return "No indexed file matches src/readiness.ts"
        return 'No relevant code found for "Review blast radius ... src/readiness.ts"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", GENERIC_QUERY], "/target")

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore", "node"]


def test_nonstandard_empty_query_does_not_probe_repository_paths(monkeypatch: pytest.MonkeyPatch) -> None:
    """Recovery is limited to Noema's bounded changed-file query contract."""
    calls: list[list[str]] = []

    def fake_runner(args, _source_root):
        calls.append(list(args))
        return 'No relevant code found for "arbitrary query"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", "arbitrary query"], "/target")

    assert result == '## codegraph explore\nNo relevant code found for "arbitrary query"'
    assert [call[1] for call in calls] == ["explore"]


def test_failed_symbol_probe_can_fall_through_to_next_changed_file(monkeypatch: pytest.MonkeyPatch) -> None:
    """One failed bounded node probe must not suppress a later indexed changed file."""
    calls: list[list[str]] = []
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: src/missing.ts src/readiness.ts"
    )

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node" and args[3] == "src/missing.ts":
            raise RuntimeError("node probe unavailable for first file")
        if args[1] == "node":
            return "**Symbols**\n- commercialReadiness"
        if "Indexed changed-file symbol maps" in args[2]:
            return "commercialReadiness <- workflowEntry"
        return 'No relevant code found for "path-only query"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], "/target")

    assert result == "## codegraph explore\ncommercialReadiness <- workflowEntry"
    assert [call[1] for call in calls] == ["explore", "node", "node", "explore"]
