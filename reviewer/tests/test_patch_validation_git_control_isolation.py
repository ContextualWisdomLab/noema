"""Regression tests for isolating exact-commit archives from local Git metadata."""

from __future__ import annotations

import hashlib
import json
import os
import stat
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationStatus,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _run_git(source: Path, *arguments: str) -> str:
    """Run one deterministic local Git command and return stripped stdout."""
    completed = subprocess.run(
        [patch_validation.TRUSTED_GIT_EXECUTABLE, "-C", str(source), *arguments],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    return completed.stdout.strip()


def _patch_bytes() -> bytes:
    """Return a bounded text patch for an ordinary repository source file."""
    return (
        "diff --git a/other.txt b/other.txt\n"
        "index 1111111..2222222 100644\n"
        "--- a/other.txt\n"
        "+++ b/other.txt\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode("utf-8")


def _mount_source(command: list[str], destination: str) -> Path:
    """Return the source path for one exact Docker bind-mount destination."""
    suffix = f",dst={destination},readonly"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=type=bind,src=") and argument.endswith(suffix)
    )
    return Path(mount.removeprefix("--mount=type=bind,src=").removesuffix(suffix))


def _output_source(command: list[str]) -> Path:
    """Return the host source for the validator's writable result-file mount."""
    suffix = ",dst=/output/result.json"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=type=bind,src=") and argument.endswith(suffix)
    )
    return Path(mount.removeprefix("--mount=type=bind,src=").removesuffix(suffix))


def _repository(tmp_path: Path) -> tuple[Path, str]:
    """Create one exact committed repository for isolated-status tests."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    (source / "kept.txt").write_text("committed bytes\n", encoding="utf-8")
    (source / "other.txt").write_text("old\n", encoding="utf-8")
    _run_git(source, "add", "kept.txt", "other.txt")
    _run_git(source, "commit", "-m", "test exact source")
    return source, _run_git(source, "rev-parse", "HEAD")


def test_local_git_info_attributes_cannot_rewrite_exact_commit_snapshot(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Host-local Git attributes must not omit bytes from the requested commit."""
    source, head_sha = _repository(tmp_path)
    info_directory = source / ".git" / "info"
    info_directory.mkdir(exist_ok=True)
    (info_directory / "attributes").write_text(
        "kept.txt export-ignore\n",
        encoding="utf-8",
    )

    patch_bytes = _patch_bytes()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )

    def fake_run(command: list[str], **_kwargs: object) -> SimpleNamespace:
        """Require Docker to receive the commit byte hidden by hostile metadata."""
        mounted_source = _mount_source(command, "/input")
        assert (mounted_source / "kept.txt").read_text(encoding="utf-8") == (
            "committed bytes\n"
        )
        result_path = _output_source(command)
        result = {
            "status": "passed",
            "repository_full_name": request.repository_full_name,
            "base_sha": request.base_sha,
            "head_sha": request.head_sha,
            "patch_sha256": request.patch_sha256,
            "profile": request.profile.value,
            "command_profile": "npm run release:verify",
            "exit_code": 0,
            "duration_ms": 1,
            "stdout_excerpt": "verified",
            "stderr_excerpt": "",
            "reason_codes": [],
        }
        result_path.write_text(json.dumps(result), encoding="utf-8")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    result = DockerPatchValidationRunner(
        command_runner=fake_run,
        cleanup_runner=fake_run,
        name_factory=lambda: "isolated-git-control-test",
    ).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidationStatus.PASSED


def test_git_control_reader_rejects_unavailable_nonregular_and_ambiguous_files(
    tmp_path: Path,
) -> None:
    """Missing, directory, malformed UTF-8, and multiline controls fail closed."""
    with pytest.raises(RuntimeError, match="unavailable"):
        patch_validation._read_git_control_line(tmp_path / "missing", "control")

    directory = tmp_path / "directory"
    directory.mkdir()
    with pytest.raises(RuntimeError, match="regular non-symlink"):
        patch_validation._read_git_control_line(directory, "control")

    malformed = tmp_path / "malformed"
    malformed.write_bytes(b"\xff")
    with pytest.raises(RuntimeError, match="valid UTF-8"):
        patch_validation._read_git_control_line(malformed, "control")

    ambiguous = tmp_path / "ambiguous"
    ambiguous.write_text("one\ntwo\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="one unambiguous line"):
        patch_validation._read_git_control_line(ambiguous, "control")


@pytest.mark.parametrize("failure_kind", ["changed", "open", "read", "oversized"])
def test_git_control_reader_rejects_descriptor_anomalies(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    failure_kind: str,
) -> None:
    """Descriptor swaps, I/O errors, and growth beyond the bound fail closed."""
    control = tmp_path / "control"
    control.write_text("gitdir: target\n", encoding="utf-8")
    real_fstat = os.fstat

    if failure_kind == "changed":
        monkeypatch.setattr(
            patch_validation.os,
            "fstat",
            lambda descriptor: SimpleNamespace(
                st_mode=stat.S_IFREG | 0o600,
                st_dev=real_fstat(descriptor).st_dev,
                st_ino=real_fstat(descriptor).st_ino + 1,
            ),
        )
        message = "changed during validation"
    elif failure_kind == "open":
        monkeypatch.setattr(
            patch_validation.os,
            "open",
            lambda *_args: (_ for _ in ()).throw(OSError("open failed")),
        )
        message = "could not be read safely"
    elif failure_kind == "read":
        monkeypatch.setattr(
            patch_validation.os,
            "read",
            lambda *_args: (_ for _ in ()).throw(OSError("read failed")),
        )
        message = "could not be read safely"
    else:
        monkeypatch.setattr(
            patch_validation.os,
            "read",
            lambda *_args: b"x" * (patch_validation.MAX_GIT_CONTROL_FILE_BYTES + 1),
        )
        message = "invalid byte length"

    with pytest.raises(RuntimeError, match=message):
        patch_validation._read_git_control_line(control, "control")


def test_git_directory_and_gitfile_records_fail_closed(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Unsafe directory names, missing objects, and malformed records are rejected."""
    with pytest.raises(RuntimeError, match="unsafe path characters"):
        patch_validation._validated_git_directory(
            tmp_path / "unsafe\npath",
            "control",
            require_exists=False,
        )
    with pytest.raises(RuntimeError, match="unavailable"):
        patch_validation._validated_git_directory(
            tmp_path / "missing",
            "control",
            require_exists=True,
        )

    source = tmp_path / "worktree"
    source.mkdir()
    (source / ".git").write_text("not-a-gitdir\n", encoding="utf-8")
    with pytest.raises(RuntimeError, match="invalid gitdir record"):
        patch_validation._source_object_directory(
            source,
            "file",
            require_exists=False,
        )

    git_directory = tmp_path / "git-directory"
    git_directory.mkdir()
    (git_directory / "commondir").write_text("..\n", encoding="utf-8")
    (source / ".git").write_text(f"gitdir: {git_directory}\n", encoding="utf-8")
    real_lstat = os.lstat

    def fail_commondir(path: os.PathLike[str] | str):
        """Raise a non-missing OS error only for the common-directory record."""
        if Path(path) == git_directory / "commondir":
            raise PermissionError("denied")
        return real_lstat(path)

    monkeypatch.setattr(patch_validation.os, "lstat", fail_commondir)
    with pytest.raises(RuntimeError, match="common-directory record is unavailable"):
        patch_validation._source_object_directory(
            source,
            "file",
            require_exists=False,
        )


def test_isolated_status_failure_cannot_be_treated_as_clean(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed isolated status command cannot authenticate source cleanliness."""
    source, head_sha = _repository(tmp_path)
    real_run = subprocess.run
    calls = 0

    def fail_status(command, **kwargs):
        """Allow read-tree and fail only the following isolated status command."""
        nonlocal calls
        calls += 1
        if calls == 2:
            return SimpleNamespace(returncode=1, stdout="")
        return real_run(command, **kwargs)

    monkeypatch.setattr(patch_validation.subprocess, "run", fail_status)
    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        patch_validation._verify_source_head(source, head_sha, "directory")
