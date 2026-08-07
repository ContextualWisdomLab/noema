"""Exact-head provenance and unified-hunk edge regressions."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    inspect_patch_bytes,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)
BASE_SHA = "1" * 40


def _patch() -> bytes:
    """Return one ordinary exact-file modification patch."""
    return (
        b"diff --git a/src/example.ts b/src/example.ts\n"
        b"index 1111111..2222222 100644\n"
        b"--- a/src/example.ts\n"
        b"+++ b/src/example.ts\n"
        b"@@ -1 +1 @@\n"
        b"-old\n"
        b"+new\n"
    )


def _request(patch_bytes: bytes, head_sha: str) -> PatchValidationRequest:
    """Build one exact-head-bound validation request."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha=BASE_SHA,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _git_repository(tmp_path: Path) -> tuple[Path, str]:
    """Create a clean committed source repository and return its head SHA."""
    repository = tmp_path / "repository"
    repository.mkdir()
    subprocess.run(["git", "init", "-q", str(repository)], check=True)
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.email", "test@example.invalid"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(repository), "config", "user.name", "Noema Test"],
        check=True,
    )
    source = repository / "src"
    source.mkdir()
    (source / "example.ts").write_text("old\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repository), "add", "src/example.ts"], check=True)
    subprocess.run(
        ["git", "-C", str(repository), "commit", "-qm", "fixture"],
        check=True,
    )
    head_sha = subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.strip()
    return repository, head_sha


def test_metadata_free_source_cannot_claim_an_exact_git_head(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An arbitrary mutable directory cannot be labeled with a Git head SHA."""
    source = tmp_path / "metadata-free-source"
    (source / "src").mkdir(parents=True)
    (source / "src" / "example.ts").write_text("old\n", encoding="utf-8")
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(*_args, **_kwargs):
        """Fail if unauthenticated source bytes reach Docker."""
        raise AssertionError("Docker must not run for metadata-free exact-head input")

    with pytest.raises(RuntimeError, match="Git metadata"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes, "2" * 40),
            source_root=source,
            patch_path=patch_path,
        )


@pytest.mark.parametrize(("uid", "gid"), [(0, 1000), (1000, 0), (0, 0)])
def test_root_host_identity_cannot_become_the_sandbox_identity(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    uid: int,
    gid: int,
) -> None:
    """A root UID or GID must fail before Docker can launch the validator."""
    source, head_sha = _git_repository(tmp_path)
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.setattr(patch_validation.os, "getuid", lambda: uid)
    monkeypatch.setattr(patch_validation.os, "getgid", lambda: gid)

    def should_not_run(*_args, **_kwargs):
        """Fail if a root-derived sandbox identity reaches Docker."""
        raise AssertionError("Docker must not run with a root UID or GID")

    with pytest.raises(RuntimeError, match="non-root"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes, head_sha),
            source_root=source,
            patch_path=patch_path,
        )


@pytest.mark.parametrize(
    "patch_bytes",
    [
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"--- a/src/example.ts\n"
            b"+++ b/src/example.ts\n"
            b"@@ -1 +1 @@\n"
            b"\\ No newline at end of file\n"
            b"-old\n"
            b"+new\n"
        ),
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"--- a/src/example.ts\n"
            b"+++ b/src/example.ts\n"
            b"@@ -1 +1 @@\n"
            b"-old\n"
            b"\\ No newline at end of file\n"
            b"\\ No newline at end of file\n"
            b"+new\n"
        ),
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"--- a/src/example.ts\n"
            b"+++ b/src/example.ts\n"
            b"@@ -1 +1 @@\n"
            b"-old\n"
            b"+new\n"
            b"+extra\n"
        ),
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"--- a/src/example.ts\n"
            b"+++ b/src/example.ts\n"
            b"@@ -1 +1 @@\n"
            b"-old\n"
            b"+new\n"
            b"unbound trailing syntax\n"
        ),
    ],
)
def test_unified_hunk_markers_and_trailing_content_fail_closed(
    patch_bytes: bytes,
) -> None:
    """Misplaced markers, count overrun, and unbound trailing text are rejected."""
    with pytest.raises(ValueError, match="hunk|trailing|syntax"):
        inspect_patch_bytes(patch_bytes)
