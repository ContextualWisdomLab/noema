"""Branch-complete regressions for extracted Git-blob identity verification."""

from __future__ import annotations

import hashlib
import os
import stat
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


def _metadata(
    *,
    mode: int = stat.S_IFREG | 0o644,
    size: int = 1,
    device: int = 1,
    inode: int = 2,
) -> SimpleNamespace:
    """Return the minimal stable stat record used by descriptor-bound tests."""
    return SimpleNamespace(
        st_mode=mode,
        st_size=size,
        st_dev=device,
        st_ino=inode,
    )


def _sha1(payload: bytes) -> str:
    """Return Git's SHA-1 blob identity for one payload."""
    digest = hashlib.sha1(usedforsecurity=False)
    digest.update(f"blob {len(payload)}\0".encode("ascii"))
    digest.update(payload)
    return digest.hexdigest()


def test_blob_identity_rejects_unavailable_path(tmp_path: Path) -> None:
    """A path disappearing before descriptor open fails closed."""
    with pytest.raises(ValueError, match="file is unavailable"):
        patch_validation._verify_git_blob_identity(
            tmp_path / "missing.txt",
            "100644",
            "a" * 40,
            1,
        )


@pytest.mark.parametrize("shape", ("symlink", "directory", "size", "mode"))
def test_blob_identity_rejects_initial_metadata_mismatch(
    tmp_path: Path,
    shape: str,
) -> None:
    """Symlink, type, size, and executable-mode drift fail before reading bytes."""
    target = tmp_path / "target.txt"
    target.write_bytes(b"x")
    candidate = target
    expected_size = 1
    expected_mode = "100644"
    if shape == "symlink":
        candidate = tmp_path / "link.txt"
        candidate.symlink_to(target)
    elif shape == "directory":
        candidate = tmp_path / "directory"
        candidate.mkdir()
    elif shape == "size":
        expected_size = 2
    else:
        target.chmod(0o755)

    with pytest.raises(ValueError, match="does not match the exact Git tree"):
        patch_validation._verify_git_blob_identity(
            candidate,
            expected_mode,
            "a" * 40,
            expected_size,
        )


def test_blob_identity_rejects_descriptor_metadata_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A different inode returned after no-follow open cannot be trusted."""
    payload = b"x"
    candidate = tmp_path / "payload.txt"
    candidate.write_bytes(payload)
    real_fstat = os.fstat

    def substitute_inode(descriptor: int) -> SimpleNamespace:
        """Return a regular descriptor record bound to another inode."""
        metadata = real_fstat(descriptor)
        return _metadata(
            mode=metadata.st_mode,
            size=metadata.st_size,
            device=metadata.st_dev,
            inode=metadata.st_ino + 1,
        )

    monkeypatch.setattr(patch_validation.os, "fstat", substitute_inode)

    with pytest.raises(ValueError, match="changed during verification"):
        patch_validation._verify_git_blob_identity(
            candidate,
            "100644",
            _sha1(payload),
            len(payload),
        )


def test_blob_identity_rejects_descriptor_open_failure_without_closing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An open failure exercises the no-descriptor cleanup path."""
    candidate = tmp_path / "payload.txt"
    candidate.write_bytes(b"x")
    closed: list[int] = []

    def fail_open(*_args: object, **_kwargs: object) -> int:
        """Fail before any descriptor exists."""
        raise OSError("open failed")

    monkeypatch.setattr(patch_validation.os, "open", fail_open)
    monkeypatch.setattr(patch_validation.os, "close", closed.append)

    with pytest.raises(ValueError, match="could not be read safely"):
        patch_validation._verify_git_blob_identity(
            candidate,
            "100644",
            _sha1(b"x"),
            1,
        )

    assert closed == []


def _install_descriptor_stream(
    monkeypatch: pytest.MonkeyPatch,
    reads: list[bytes | BaseException],
    fstats: list[SimpleNamespace],
) -> list[int]:
    """Install deterministic descriptor operations and return observed closes."""
    closed: list[int] = []
    monkeypatch.setattr(patch_validation.os, "lstat", lambda _path: fstats[0])
    monkeypatch.setattr(patch_validation.os, "open", lambda *_args, **_kwargs: 7)
    fstat_iter = iter(fstats[1:])
    monkeypatch.setattr(patch_validation.os, "fstat", lambda _descriptor: next(fstat_iter))
    read_iter = iter(reads)

    def read(_descriptor: int, _size: int) -> bytes:
        """Return or raise the next configured descriptor-read outcome."""
        outcome = next(read_iter)
        if isinstance(outcome, BaseException):
            raise outcome
        return outcome

    monkeypatch.setattr(patch_validation.os, "read", read)
    monkeypatch.setattr(patch_validation.os, "close", closed.append)
    return closed


def test_blob_identity_rejects_premature_eof(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A descriptor ending before its declared size cannot authenticate a blob."""
    metadata = _metadata(size=1)
    closed = _install_descriptor_stream(
        monkeypatch,
        [b""],
        [metadata, metadata],
    )

    with pytest.raises(ValueError, match="ended before its declared size"):
        patch_validation._verify_git_blob_identity(
            Path("/virtual/payload.txt"),
            "100644",
            "a" * 40,
            1,
        )

    assert closed == [7]


def test_blob_identity_rejects_trailing_bytes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Bytes beyond the authenticated size cannot be silently ignored."""
    metadata = _metadata(size=1)
    closed = _install_descriptor_stream(
        monkeypatch,
        [b"x", b"y"],
        [metadata, metadata],
    )

    with pytest.raises(ValueError, match="exceeds its declared size"):
        patch_validation._verify_git_blob_identity(
            Path("/virtual/payload.txt"),
            "100644",
            _sha1(b"x"),
            1,
        )

    assert closed == [7]


def test_blob_identity_rejects_post_read_metadata_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A file changing after byte reads is rejected before digest admission."""
    metadata = _metadata(size=1)
    changed = _metadata(size=1, inode=3)
    closed = _install_descriptor_stream(
        monkeypatch,
        [b"x", b""],
        [metadata, metadata, changed],
    )

    with pytest.raises(ValueError, match="changed during verification"):
        patch_validation._verify_git_blob_identity(
            Path("/virtual/payload.txt"),
            "100644",
            _sha1(b"x"),
            1,
        )

    assert closed == [7]


def test_blob_identity_wraps_descriptor_read_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An operating-system read error closes the descriptor and fails closed."""
    metadata = _metadata(size=1)
    closed = _install_descriptor_stream(
        monkeypatch,
        [OSError("read failed")],
        [metadata, metadata],
    )

    with pytest.raises(ValueError, match="could not be read safely"):
        patch_validation._verify_git_blob_identity(
            Path("/virtual/payload.txt"),
            "100644",
            "a" * 40,
            1,
        )

    assert closed == [7]


def test_blob_identity_accepts_executable_sha256_blob(tmp_path: Path) -> None:
    """SHA-256 repositories and executable files use the same Git blob contract."""
    payload = b"echo safe\n"
    candidate = tmp_path / "script.sh"
    candidate.write_bytes(payload)
    candidate.chmod(0o755)
    digest = hashlib.sha256()
    digest.update(f"blob {len(payload)}\0".encode("ascii"))
    digest.update(payload)

    patch_validation._verify_git_blob_identity(
        candidate,
        "100755",
        digest.hexdigest(),
        len(payload),
    )


def test_materialized_snapshot_rejects_unexpected_file(
    tmp_path: Path,
) -> None:
    """A regular file absent from the authenticated inventory fails immediately."""
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()
    unexpected = snapshot / "unexpected.txt"
    unexpected.write_bytes(b"x")

    with pytest.raises(ValueError, match="file set does not match"):
        patch_validation._verify_materialized_snapshot(
            snapshot,
            {"unexpected.txt": ("file", 1)},
            {},
        )


def test_materialized_snapshot_rejects_archive_manifest_mismatch(
    tmp_path: Path,
) -> None:
    """The extracted filesystem must still equal the validated archive manifest."""
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()

    with pytest.raises(ValueError, match="validated archive"):
        patch_validation._verify_materialized_snapshot(
            snapshot,
            {"missing.txt": ("file", 1)},
        )


def test_materialized_snapshot_rejects_missing_exact_tree_file(
    tmp_path: Path,
) -> None:
    """A matching directory manifest cannot hide an omitted authenticated file."""
    snapshot = tmp_path / "snapshot"
    snapshot.mkdir()
    directory = snapshot / "directory"
    directory.mkdir()

    with pytest.raises(ValueError, match="file set does not match"):
        patch_validation._verify_materialized_snapshot(
            snapshot,
            {"directory": ("directory", 0)},
            {"missing.txt": ("100644", "a" * 40, 1)},
        )
