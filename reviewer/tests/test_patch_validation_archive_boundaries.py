"""Adversarial archive-boundary regressions for exact source snapshots."""

from __future__ import annotations

import io
import stat
import tarfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


def _archive_runner(
    entries: list[tuple[tarfile.TarInfo, bytes | None]],
):
    """Return a fake Git runner that writes one controlled tar archive."""

    def run(command, **_kwargs):
        """Write the requested archive and report a successful Git command."""
        output = next(
            argument.removeprefix("--output=")
            for argument in command
            if argument.startswith("--output=")
        )
        with tarfile.open(output, mode="w") as archive:
            for member, payload in entries:
                archive.addfile(
                    member,
                    None if payload is None else io.BytesIO(payload),
                )
        return SimpleNamespace(returncode=0)

    return run


def _regular_member(name: str, payload: bytes) -> tuple[tarfile.TarInfo, bytes]:
    """Build one regular archive member with an exact declared size."""
    member = tarfile.TarInfo(name)
    member.size = len(payload)
    member.mode = 0o640
    return member, payload


def _directory_member(name: str) -> tuple[tarfile.TarInfo, None]:
    """Build one explicit archive directory member."""
    member = tarfile.TarInfo(name)
    member.type = tarfile.DIRTYPE
    member.mode = 0o750
    return member, None


def _materialize(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    entries: list[tuple[tarfile.TarInfo, bytes | None]],
) -> Path:
    """Materialize one controlled archive through the production boundary."""
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        _archive_runner(entries),
    )
    staging = tmp_path / "staging"
    staging.mkdir()
    return patch_validation._materialize_committed_source(
        tmp_path,
        "2" * 40,
        staging,
        "directory",
    )


@pytest.mark.parametrize(
    ("member_type", "link_name"),
    [
        (tarfile.SYMTYPE, "target.txt"),
        (tarfile.LNKTYPE, "target.txt"),
        (tarfile.FIFOTYPE, ""),
        (tarfile.CHRTYPE, ""),
        (tarfile.BLKTYPE, ""),
    ],
)
def test_snapshot_rejects_non_regular_archive_members(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    member_type: bytes,
    link_name: str,
) -> None:
    """Links, devices, and FIFOs cannot enter the Docker-mounted snapshot."""
    member = tarfile.TarInfo("unsafe-entry")
    member.type = member_type
    member.linkname = link_name

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(tmp_path, monkeypatch, [(member, None)])


@pytest.mark.parametrize(
    "unsafe_name",
    [
        "../escape.txt",
        "/absolute.txt",
        "unsafe\\name.txt",
        "control\nname.txt",
        ".git/config",
    ],
)
def test_snapshot_rejects_unsafe_archive_member_names(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    unsafe_name: str,
) -> None:
    """Archive names must remain normalized repository-relative POSIX paths."""
    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [_regular_member(unsafe_name, b"unsafe")],
        )


def test_snapshot_rejects_empty_archive(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An empty source archive cannot be treated as usable committed source."""
    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(tmp_path, monkeypatch, [])


def test_snapshot_rejects_duplicate_archive_member_names(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Duplicate names cannot overwrite earlier validated archive entries."""
    duplicate = _regular_member("src/example.txt", b"first")
    replacement = _regular_member("src/example.txt", b"second")

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(tmp_path, monkeypatch, [duplicate, replacement])


def test_snapshot_rejects_content_below_regular_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An archive cannot place a child beneath a path already declared as a file."""
    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _regular_member("parent", b"file"),
                _regular_member("parent/child.txt", b"child"),
            ],
        )


def test_snapshot_rejects_implicit_directory_replaced_by_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A later file cannot replace an implicit directory created by a child path."""
    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _regular_member("parent/child.txt", b"child"),
                _regular_member("parent", b"file"),
            ],
        )


def test_snapshot_rejects_leaf_directory_gitlink_shape(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A leaf directory entry is rejected as an unmaterialized gitlink shape."""
    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [_directory_member("third_party/dependency/")],
        )


def test_snapshot_rejects_excessive_archive_member_count(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The snapshot refuses archives whose member count exceeds its bound."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_MEMBERS", 1)

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _regular_member("one.txt", b"1"),
                _regular_member("two.txt", b"2"),
            ],
        )


def test_snapshot_rejects_oversized_archive_member(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """One oversized file cannot exhaust extraction storage."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_MEMBER_BYTES", 1)

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [_regular_member("large.txt", b"12")],
        )


def test_snapshot_rejects_excessive_total_archive_bytes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Aggregate declared file bytes remain below a deterministic limit."""
    monkeypatch.setattr(patch_validation, "MAX_SOURCE_ARCHIVE_TOTAL_BYTES", 3)

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _regular_member("one.txt", b"12"),
                _regular_member("two.txt", b"34"),
            ],
        )


def test_snapshot_verifies_extracted_member_type(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Post-extraction verification rejects a substituted symbolic link."""
    original_extractall = tarfile.TarFile.extractall

    def substitute_symlink(archive, path, *args, **kwargs):
        """Extract normally, then replace a regular member before verification."""
        original_extractall(archive, path, *args, **kwargs)
        extracted = Path(path) / "src" / "example.txt"
        extracted.unlink()
        extracted.symlink_to("missing-target")

    monkeypatch.setattr(tarfile.TarFile, "extractall", substitute_symlink)

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _directory_member("src/"),
                _regular_member("src/example.txt", b"trusted"),
            ],
        )


def test_snapshot_verifies_extracted_member_size(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Post-extraction verification rejects content whose size changed."""
    original_extractall = tarfile.TarFile.extractall

    def substitute_size(archive, path, *args, **kwargs):
        """Extract normally, then alter a regular member before verification."""
        original_extractall(archive, path, *args, **kwargs)
        extracted = Path(path) / "src" / "example.txt"
        extracted.write_bytes(b"changed-size")

    monkeypatch.setattr(tarfile.TarFile, "extractall", substitute_size)

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize(
            tmp_path,
            monkeypatch,
            [
                _directory_member("src/"),
                _regular_member("src/example.txt", b"trusted"),
            ],
        )


def test_snapshot_accepts_only_bounded_regular_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A bounded directory and regular file tree remains usable by Docker."""
    snapshot = _materialize(
        tmp_path,
        monkeypatch,
        [
            _directory_member("src/"),
            _regular_member("src/example.txt", b"trusted"),
        ],
    )

    directory_mode = snapshot.joinpath("src").lstat().st_mode
    file_path = snapshot / "src" / "example.txt"
    file_mode = file_path.lstat().st_mode
    assert stat.S_ISDIR(directory_mode)
    assert stat.S_ISREG(file_mode)
    assert not stat.S_ISLNK(file_mode)
    assert file_path.read_bytes() == b"trusted"
