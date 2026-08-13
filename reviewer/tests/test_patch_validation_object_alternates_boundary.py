"""Fail-closed regressions for Git alternate object-database metadata."""

from __future__ import annotations

import hashlib
import os
import subprocess
from pathlib import Path

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


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


def _repository(tmp_path: Path, name: str) -> Path:
    """Create one ordinary temporary Git repository with deterministic identity."""
    source = tmp_path / name
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    return source


@pytest.mark.parametrize("metadata_name", ("alternates", "http-alternates"))
def test_source_object_directory_rejects_alternate_metadata(
    tmp_path: Path,
    metadata_name: str,
) -> None:
    """A source object store cannot borrow objects or URLs outside its boundary."""
    source = _repository(tmp_path, "source")
    metadata_path = source / ".git" / "objects" / "info" / metadata_name
    metadata_path.parent.mkdir(parents=True, exist_ok=True)
    metadata_path.write_text("/outside/object-store\n", encoding="utf-8")

    with pytest.raises(RuntimeError, match="alternate object database"):
        patch_validation._source_object_directory(
            source,
            "directory",
            require_exists=True,
        )


def test_source_object_directory_rejects_unreadable_alternate_metadata(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An I/O error while checking alternate metadata cannot be treated as absence."""
    source = _repository(tmp_path, "source")
    alternates_path = source / ".git" / "objects" / "info" / "alternates"
    real_lstat = os.lstat

    def deny_alternates(path: os.PathLike[str] | str):
        """Deny only the source-local alternates record."""
        if Path(path) == alternates_path:
            raise PermissionError("denied")
        return real_lstat(path)

    monkeypatch.setattr(patch_validation.os, "lstat", deny_alternates)

    with pytest.raises(RuntimeError, match="alternate object metadata is unavailable"):
        patch_validation._source_object_directory(
            source,
            "directory",
            require_exists=True,
        )


def test_runner_rejects_exact_head_borrowed_from_external_object_store(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A clean worktree cannot import another repository's private object graph."""
    lender = _repository(tmp_path, "lender")
    private_file = lender / "private.txt"
    private_file.write_text("private bytes\n", encoding="utf-8")
    _run_git(lender, "add", "private.txt")
    _run_git(lender, "commit", "-qm", "private fixture")
    borrowed_head = _run_git(lender, "rev-parse", "HEAD")

    source = _repository(tmp_path, "source")
    alternates_path = source / ".git" / "objects" / "info" / "alternates"
    alternates_path.write_text(
        f"{lender / '.git' / 'objects'}\n",
        encoding="utf-8",
    )
    _run_git(source, "checkout", "--detach", "-q", borrowed_head)

    patch_bytes = (
        "diff --git a/private.txt b/private.txt\n"
        "--- a/private.txt\n"
        "+++ b/private.txt\n"
        "@@ -1 +1 @@\n"
        "-private bytes\n"
        "+public bytes\n"
    ).encode("utf-8")
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=borrowed_head,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(*_args: object, **_kwargs: object):
        """Expose any attempt to launch Docker with borrowed source objects."""
        raise AssertionError("Docker must not receive borrowed source objects")

    with pytest.raises(RuntimeError, match="alternate object database"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
