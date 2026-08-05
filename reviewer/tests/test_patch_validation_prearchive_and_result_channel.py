"""Pre-serialization source limits and single-file result-channel regressions."""

from __future__ import annotations

import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


class _ResultFileSystem:
    """Record bounded descriptor reads while emulating one stable regular file."""

    def __init__(self, payload: bytes) -> None:
        """Store one payload and initialize descriptor-read observations."""
        self.payload = payload
        self.offset = 0
        self.requested_sizes: list[int] = []
        self.metadata = SimpleNamespace(
            st_mode=stat.S_IFREG | 0o600,
            st_size=len(payload),
            st_dev=1,
            st_ino=2,
        )

    def lstat(self, _path: Path) -> SimpleNamespace:
        """Return stable path metadata."""
        return self.metadata

    def open(self, _path: Path, _flags: int) -> int:
        """Return one deterministic descriptor."""
        return 7

    def fstat(self, _descriptor: int) -> SimpleNamespace:
        """Return metadata for the opened descriptor."""
        return self.metadata

    def read(self, _descriptor: int, size: int) -> bytes:
        """Return at most the requested payload bytes and record the bound."""
        self.requested_sizes.append(size)
        chunk = self.payload[self.offset : self.offset + size]
        self.offset += len(chunk)
        return chunk

    def close(self, _descriptor: int) -> None:
        """Close the deterministic descriptor without side effects."""


def test_result_reader_never_uses_stdout_fallback(tmp_path: Path) -> None:
    """An empty result file fails even when a runner returns forged JSON stdout."""
    result_path = tmp_path / "result.json"
    result_path.touch(mode=0o600)
    completed = SimpleNamespace(returncode=0, stdout='{"status":"passed"}')

    with pytest.raises(RuntimeError, match="result.*must not be empty"):
        patch_validation._read_result_payload(result_path, completed)


def test_result_reader_stops_at_sixteen_kibibytes_plus_one() -> None:
    """Result evidence cannot be read through the larger patch-file budget."""
    payload = b"x" * (patch_validation.MAX_RESULT_JSON_BYTES + 1)
    file_system = _ResultFileSystem(payload)

    with pytest.raises(RuntimeError, match="result.*exceeds"):
        patch_validation._read_result_payload(
            Path("/bounded/result.json"),
            file_system=file_system,
        )

    assert file_system.requested_sizes
    assert max(file_system.requested_sizes) <= patch_validation.MAX_RESULT_JSON_BYTES + 1


def test_exact_tree_limits_are_checked_before_git_archive(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An over-limit blob is rejected before archive bytes reach runner storage."""
    source = tmp_path / "source"
    source.mkdir()
    staging = tmp_path / "staging"
    staging.mkdir()
    isolated_control = staging / "isolated-control"
    isolated_control.mkdir()
    archive_started = False

    monkeypatch.setattr(
        patch_validation,
        "_create_isolated_git_control",
        lambda *_args, **_kwargs: isolated_control,
    )

    def fake_run(command, **_kwargs):
        """Expose an oversized exact-tree entry and forbid archive execution."""
        nonlocal archive_started
        command_list = list(command)
        if "ls-tree" in command_list:
            return SimpleNamespace(
                returncode=0,
                stdout=(
                    "100644 blob "
                    f"{'a' * 40} "
                    f"{patch_validation.MAX_SOURCE_ARCHIVE_MEMBER_BYTES + 1}"
                    "\toversized.bin\0"
                ),
            )
        if "archive" in command_list:
            archive_started = True
            return SimpleNamespace(returncode=0)
        raise AssertionError(f"unexpected Git command: {command_list}")

    monkeypatch.setattr(patch_validation.subprocess, "run", fake_run)

    with pytest.raises(RuntimeError, match="tree|byte limit|materialized"):
        patch_validation._materialize_committed_source(
            source,
            "1" * 40,
            staging,
            "directory",
        )

    assert archive_started is False
