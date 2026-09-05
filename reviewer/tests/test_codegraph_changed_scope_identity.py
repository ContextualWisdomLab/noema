"""Exact-path identity tests for CodeGraph changed-file query construction."""

from __future__ import annotations

from pathlib import Path

from noema_reviewer.github_io import _fetch_codegraph_status


def test_long_changed_path_is_not_truncated_before_codegraph_explore(tmp_path: Path) -> None:
    """A valid repository-relative path beyond 300 chars must reach explore unchanged."""
    relative_path = "/".join(["nested-directory-name" * 3] * 6) + "/target.ts"
    target = tmp_path / relative_path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text("export const exactPathAuthority = true;\n", encoding="utf-8")
    calls: list[list[str]] = []

    def fake_runner(args: list[str], source_root: str) -> str:
        """Capture the exact CodeGraph argv while returning semantic explore output."""
        calls.append(list(args))
        assert source_root == str(tmp_path)
        if args[1] == "explore":
            return "exactPathAuthority -> reviewBoundary"
        return ""

    _fetch_codegraph_status(str(tmp_path), [relative_path], fake_runner)

    explore_call = next(call for call in calls if call[1] == "explore")
    assert len(relative_path) > 300
    assert relative_path in explore_call[2]


def test_changed_file_count_over_exact_scope_budget_fails_closed_without_codegraph_execution(
    tmp_path: Path,
) -> None:
    """More than 80 changed paths must fail before any CodeGraph subprocess is authorized."""
    calls: list[list[str]] = []

    def fake_runner(args: list[str], source_root: str) -> str:
        """Record any execution so deterministic scope rejection cannot consume tool authority."""
        calls.append(list(args))
        assert source_root == str(tmp_path)
        return ""

    status = _fetch_codegraph_status(
        str(tmp_path),
        [f"src/review-scope-{index}.ts" for index in range(81)],
        fake_runner,
    )

    assert status == "unavailable: CodeGraph changed-file scope exceeds exact file budget"
    assert calls == []


def test_oversized_exact_changed_scope_fails_closed_without_codegraph_execution(tmp_path: Path) -> None:
    """An over-budget exact query must fail before any CodeGraph subprocess is authorized."""
    calls: list[list[str]] = []

    def fake_runner(args: list[str], source_root: str) -> str:
        """Record any execution so deterministic scope rejection cannot consume tool authority."""
        calls.append(list(args))
        assert source_root == str(tmp_path)
        return ""

    status = _fetch_codegraph_status(str(tmp_path), ["x" * 301] * 80, fake_runner)

    assert status == "unavailable: CodeGraph changed-file scope exceeds exact query budget"
    assert calls == []
