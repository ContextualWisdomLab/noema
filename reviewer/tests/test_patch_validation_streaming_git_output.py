"""Streaming regressions for hostile Git status and exact-tree output."""

from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


class _FakeStdout:
    """Expose one stable descriptor identity for a fake child stdout pipe."""

    def fileno(self) -> int:
        """Return a deterministic descriptor used by monkeypatched reads."""
        return 91


class _FakeProcess:
    """Record bounded termination and wait behavior for one fake Git child."""

    def __init__(self, *, returncode: int = 0) -> None:
        """Initialize a running child with a fake stdout descriptor."""
        self.stdout = _FakeStdout()
        self.returncode: int | None = None
        self.final_returncode = returncode
        self.terminated = False
        self.killed = False

    def poll(self) -> int | None:
        """Return the current child state without changing it."""
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        """Complete the child and return its configured exit status."""
        del timeout
        self.returncode = self.final_returncode
        return self.returncode

    def terminate(self) -> None:
        """Record graceful early termination."""
        self.terminated = True
        self.returncode = -15

    def kill(self) -> None:
        """Record forced early termination."""
        self.killed = True
        self.returncode = -9


def _ready(*_args, **_kwargs):
    """Report the fake stdout descriptor as immediately readable."""
    return ([_args[0][0]], [], [])


def test_exact_tree_reader_stops_at_aggregate_output_ceiling(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Exact-tree output is terminated after at most the configured ceiling plus one."""
    process = _FakeProcess()
    requested_sizes: list[int] = []
    chunks = iter((b"x" * 33,))
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_TREE_METADATA_BYTES", 32)
    monkeypatch.setattr(
        patch_validation.subprocess,
        "Popen",
        lambda *_args, **_kwargs: process,
    )
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(
            AssertionError("exact-tree output must not use subprocess.run capture")
        ),
    )
    monkeypatch.setattr(patch_validation.select, "select", _ready)

    def bounded_read(_descriptor: int, size: int) -> bytes:
        """Record the requested size and return one over-limit chunk."""
        requested_sizes.append(size)
        return next(chunks)

    monkeypatch.setattr(patch_validation.os, "read", bounded_read)

    with pytest.raises(RuntimeError, match="bounded validation"):
        patch_validation._verify_exact_tree_limits(tmp_path, "1" * 40)

    assert requested_sizes == [33]
    assert process.terminated
    assert not process.killed


def test_dirty_status_reads_one_byte_then_terminates(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The first dirty-worktree byte is sufficient to stop status collection."""
    source = tmp_path / "source"
    source.mkdir()
    staging_control = tmp_path / "isolated-control"
    staging_control.mkdir()
    process = _FakeProcess()
    requested_sizes: list[int] = []
    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: staging_control,
    )

    def bounded_run(command, **_kwargs):
        """Permit only the exact-head index population command."""
        if "read-tree" not in list(command):
            raise AssertionError("status output must use bounded streaming")
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(patch_validation.subprocess, "run", bounded_run)
    monkeypatch.setattr(
        patch_validation.subprocess,
        "Popen",
        lambda *_args, **_kwargs: process,
    )
    monkeypatch.setattr(patch_validation.select, "select", _ready)

    def one_byte(_descriptor: int, size: int) -> bytes:
        """Return the first dirty byte and prove the read is capped at one."""
        requested_sizes.append(size)
        return b"?"

    monkeypatch.setattr(patch_validation.os, "read", one_byte)

    with pytest.raises(RuntimeError, match="worktree is not clean"):
        patch_validation._verify_source_head(source, "2" * 40, "directory")

    assert requested_sizes == [1]
    assert process.terminated
    assert not process.killed


def test_exact_tree_rejects_oversized_path_before_decoding(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One hostile path cannot create an unbounded record buffer."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_TREE_PATH_BYTES", 4)
    record = f"100644 blob {'a' * 40} 1\tlong-path.txt\0"

    with pytest.raises(ValueError, match="path byte limit"):
        patch_validation._validated_exact_tree_output(record)
