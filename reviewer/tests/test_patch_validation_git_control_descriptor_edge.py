"""Descriptor-state regression for bounded Git control-line reads."""

from __future__ import annotations

from pathlib import Path

import pytest

from noema_reviewer import patch_validation


def test_git_control_reader_skips_close_for_absent_descriptor_sentinel(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The defensive cleanup branch tolerates an opener returning no descriptor."""
    control_file = tmp_path / "git-control"
    control_file.write_text("gitdir: objects\n", encoding="utf-8")
    metadata = control_file.lstat()
    chunks = iter((b"gitdir: objects\n", b""))

    monkeypatch.setattr(patch_validation.os, "open", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(patch_validation.os, "fstat", lambda _descriptor: metadata)
    monkeypatch.setattr(
        patch_validation.os,
        "read",
        lambda _descriptor, _size: next(chunks),
    )

    def fail_close(_descriptor) -> None:
        """Fail if cleanup tries to close the absent descriptor sentinel."""
        raise AssertionError("an absent descriptor must not be closed")

    monkeypatch.setattr(patch_validation.os, "close", fail_close)

    assert (
        patch_validation._read_git_control_line(control_file, "test control")
        == "gitdir: objects"
    )
