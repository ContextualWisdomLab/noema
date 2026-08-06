"""Exact-tree, archive, and extracted-byte identity regressions."""

from __future__ import annotations

import io
import subprocess
import tarfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation


ArchiveMember = tuple[str, bytes, int]


def _run_git(source: Path, *arguments: str) -> str:
    """Run one bounded non-shell Git command and return stripped stdout."""
    completed = subprocess.run(
        [patch_validation.TRUSTED_GIT_EXECUTABLE, "-C", str(source), *arguments],
        check=True,
        shell=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=30,
    )
    return completed.stdout.strip()


def _repository(
    tmp_path: Path,
    files: dict[str, tuple[bytes, int]],
) -> tuple[Path, str]:
    """Create one self-contained committed repository with exact file modes."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    for relative_path, (content, mode) in files.items():
        path = source / relative_path
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        path.chmod(mode)
    _run_git(source, "add", "--all")
    _run_git(source, "commit", "-qm", "exact-tree fixture")
    return source, _run_git(source, "rev-parse", "HEAD")


def _write_archive(path: Path, members: tuple[ArchiveMember, ...]) -> None:
    """Write one deterministic regular-file tar archive for substitution tests."""
    with tarfile.open(path, mode="w") as archive:
        for name, content, mode in members:
            member = tarfile.TarInfo(name)
            member.size = len(content)
            member.mode = mode
            archive.addfile(member, io.BytesIO(content))


def _materialize_with_substituted_archive(
    source: Path,
    head_sha: str,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    members: tuple[ArchiveMember, ...],
) -> Path:
    """Replace only Git archive output while retaining the real exact-tree preflight."""
    staging = tmp_path / "staging"
    staging.mkdir()

    def substitute_archive(command, **_kwargs):
        """Write the selected structurally valid but unauthenticated archive."""
        command_list = list(command)
        if "archive" not in command_list:
            raise AssertionError(f"unexpected subprocess.run command: {command_list}")
        output = next(
            argument.removeprefix("--output=")
            for argument in command_list
            if argument.startswith("--output=")
        )
        _write_archive(Path(output), members)
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(patch_validation.subprocess, "run", substitute_archive)
    return patch_validation._materialize_committed_source(
        source,
        head_sha,
        staging,
        "directory",
    )


def test_snapshot_rejects_archive_omission_from_exact_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Every authenticated committed file must be present in the archive."""
    source, head_sha = _repository(
        tmp_path,
        {
            "kept.txt": (b"kept\n", 0o644),
            "omitted.txt": (b"must remain\n", 0o644),
        },
    )

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize_with_substituted_archive(
            source,
            head_sha,
            tmp_path,
            monkeypatch,
            (("kept.txt", b"kept\n", 0o644),),
        )


def test_snapshot_rejects_archive_addition_outside_exact_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An archive cannot inject an unauthenticated regular file."""
    source, head_sha = _repository(
        tmp_path,
        {"kept.txt": (b"kept\n", 0o644)},
    )

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize_with_substituted_archive(
            source,
            head_sha,
            tmp_path,
            monkeypatch,
            (
                ("kept.txt", b"kept\n", 0o644),
                ("injected.txt", b"injected\n", 0o644),
            ),
        )


def test_snapshot_rejects_archive_rename_from_exact_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Authenticated path identity cannot be replaced by an archive rename."""
    source, head_sha = _repository(
        tmp_path,
        {"original.txt": (b"trusted\n", 0o644)},
    )

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize_with_substituted_archive(
            source,
            head_sha,
            tmp_path,
            monkeypatch,
            (("renamed.txt", b"trusted\n", 0o644),),
        )


def test_snapshot_rejects_archive_mode_drift(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A non-executable committed blob cannot become executable in the archive."""
    source, head_sha = _repository(
        tmp_path,
        {"script.sh": (b"echo safe\n", 0o644)},
    )

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize_with_substituted_archive(
            source,
            head_sha,
            tmp_path,
            monkeypatch,
            (("script.sh", b"echo safe\n", 0o755),),
        )


@pytest.mark.parametrize(
    "replacement",
    (
        b"hostile\n",
        b"longer hostile replacement\n",
    ),
)
def test_snapshot_rejects_archive_blob_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    replacement: bytes,
) -> None:
    """Same-size and different-size bytes must match the authenticated Git blob ID."""
    source, head_sha = _repository(
        tmp_path,
        {"payload.txt": (b"trusted\n", 0o644)},
    )

    with pytest.raises(RuntimeError, match="materialized safely"):
        _materialize_with_substituted_archive(
            source,
            head_sha,
            tmp_path,
            monkeypatch,
            (("payload.txt", replacement, 0o644),),
        )


def test_snapshot_rejects_same_size_post_extraction_substitution(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Extracted bytes are rehashed after extraction rather than trusted by size."""
    source, head_sha = _repository(
        tmp_path,
        {"payload.txt": (b"trusted\n", 0o644)},
    )
    staging = tmp_path / "staging"
    staging.mkdir()
    original_extractall = tarfile.TarFile.extractall

    def substitute_after_extraction(archive, path, *args, **kwargs):
        """Extract authentic bytes, then replace them with an equal-length payload."""
        original_extractall(archive, path, *args, **kwargs)
        extracted = Path(path) / "payload.txt"
        extracted.write_bytes(b"hostile\n")
        extracted.chmod(0o644)

    monkeypatch.setattr(tarfile.TarFile, "extractall", substitute_after_extraction)

    with pytest.raises(RuntimeError, match="materialized safely"):
        patch_validation._materialize_committed_source(
            source,
            head_sha,
            staging,
            "directory",
        )


def test_exact_tree_output_rejects_duplicate_inventory_path() -> None:
    """One canonical path cannot appear twice in the authenticated inventory."""
    oid = "a" * 40
    record = f"100644 blob {oid}       1\tduplicate.txt\0"

    with pytest.raises(ValueError, match="repeats a member name"):
        patch_validation._validated_exact_tree_output(record + record)
