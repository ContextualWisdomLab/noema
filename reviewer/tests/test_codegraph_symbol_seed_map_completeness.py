"""Regression for complete CodeGraph symbol-map recovery seeds."""

from __future__ import annotations

from pathlib import Path

import pytest

from noema_reviewer import cli


def test_oversized_symbol_map_cannot_be_truncated_into_partial_recovery(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    """A symbol map above the recovery budget must stay fail closed, not be sampled."""
    relative_path = "src/readiness.ts"
    target = tmp_path / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("export const commercialReadiness = true;\n", encoding="utf-8")
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        f"for these current-head changed files: {relative_path}"
    )
    oversized_symbol_map = "**Symbols**\n" + "\n".join(
        f"- symbol_{index:03d}" for index in range(64)
    )
    assert len(oversized_symbol_map) > cli.MAX_CODEGRAPH_SYMBOL_SEED_CHARS

    calls: list[list[str]] = []

    def fake_runner(args, _source_root):
        calls.append(list(args))
        if args[1] == "node":
            return oversized_symbol_map
        if "Indexed changed-file symbol maps" in args[2]:
            raise AssertionError("partial symbol-map recovery must not issue a second explore")
        return 'No relevant code found for "path-only query"'

    monkeypatch.setattr(cli, "default_codegraph_runner", fake_runner)

    result = cli._semantic_codegraph_runner(
        ["codegraph", "explore", query],
        str(tmp_path),
    )

    assert result.startswith("## codegraph explore\nNo relevant code found")
    assert [call[1] for call in calls] == ["explore", "node"]
