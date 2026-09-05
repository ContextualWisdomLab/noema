"""Completeness coverage for CodeGraph changed-file symbol recovery."""

from __future__ import annotations

from pathlib import Path

import pytest

from noema_reviewer import cli


def test_symbol_seed_recovery_rejects_partial_changed_file_subset(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """An empty explore cannot recover from only a prefix of the changed-file scope."""
    relative_paths = [f"src/file-{index}.ts" for index in range(cli.MAX_CODEGRAPH_SYMBOL_SEED_FILES + 1)]
    for relative_path in relative_paths:
        target = tmp_path / relative_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("export const value = true;\n", encoding="utf-8")

    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: "
        + " ".join(relative_paths)
    )
    calls: list[list[str]] = []

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node":
            return "**Symbols**\n- exportedSymbol"
        if len(calls) == 1:
            return 'No relevant code found for "path-only query"'
        return "src/file-0.ts -> exportedSymbol -> downstreamEffect"

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(["codegraph", "explore", query], str(tmp_path))

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore"]
