"""Real Git output compatibility regressions for patch preflight."""

from __future__ import annotations

import subprocess
from pathlib import Path

from noema_reviewer.patch_validation import inspect_patch_bytes


def _run_git(repository: Path, *arguments: str) -> subprocess.CompletedProcess[bytes]:
    """Run one bounded local Git command for a deterministic fixture."""
    return subprocess.run(
        ["git", "-C", str(repository), *arguments],
        check=True,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=10,
    )


def test_real_git_diff_with_space_path_is_accepted(tmp_path: Path) -> None:
    """Unquoted primary paths and tab-delimited file headers preserve one identity."""
    repository = tmp_path / "repository"
    repository.mkdir()
    _run_git(repository, "init", "-q")
    _run_git(repository, "config", "user.email", "test@example.invalid")
    _run_git(repository, "config", "user.name", "Noema Test")
    source = repository / "src"
    source.mkdir()
    target = source / "file name.ts"
    target.write_text("old\n", encoding="utf-8")
    _run_git(repository, "add", "src/file name.ts")
    _run_git(repository, "commit", "-qm", "fixture")
    target.write_text("new\n", encoding="utf-8")

    patch_bytes = _run_git(repository, "diff", "--no-ext-diff", "--no-textconv").stdout

    assert b"--- a/src/file name.ts\t" in patch_bytes
    assert b"+++ b/src/file name.ts\t" in patch_bytes
    assert inspect_patch_bytes(patch_bytes) == ("src/file name.ts",)
