"""Hardening regressions for exact-source and bounded patch validation."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationResult,
    PatchValidationStatus,
    inspect_patch_bytes,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)
BASE_SHA = "1" * 40


def _patch() -> bytes:
    """Return a minimal valid text patch."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "index 1111111..2222222 100644\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old value\n"
        "+new value\n"
    ).encode()


def _git_repository(tmp_path: Path) -> tuple[Path, str]:
    """Create a clean repository and return its exact committed HEAD."""
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
    (source / "example.ts").write_text("old value\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(repository), "add", "src/example.ts"], check=True)
    subprocess.run(
        ["git", "-C", str(repository), "commit", "-qm", "fixture"],
        check=True,
    )
    head = subprocess.run(
        ["git", "-C", str(repository), "rev-parse", "HEAD"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.strip()
    return repository, head


def _request(patch_bytes: bytes, head_sha: str) -> PatchValidationRequest:
    """Build one exact-head-bound validation request."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha=BASE_SHA,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _successful_result(request: PatchValidationRequest) -> str:
    """Return exact-request-bound successful JSON evidence."""
    return PatchValidationResult(
        status=PatchValidationStatus.PASSED,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="npm run release:verify",
        exit_code=0,
        duration_ms=1,
        stdout_excerpt="passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump_json()


def _mount_source(command: list[str], destination: str) -> Path:
    """Return the host source path for one Docker bind-mount destination."""
    suffix = f",dst={destination}"
    mount = next(part for part in command if part.startswith("--mount=") and suffix in part)
    source = mount.split("src=", 1)[1].split(",dst=", 1)[0]
    return Path(source)


def test_patch_inspector_rejects_auxiliary_governance_paths() -> None:
    """Traditional and rename headers cannot bypass the safe diff header."""
    patches = (
        (
            b"diff --git a/src/x b/src/x\n"
            b"--- a/src/x\n"
            b"+++ b/.github/workflows/pwn.yml\n"
        ),
        (
            b"diff --git a/src/x b/src/x\n"
            b"similarity index 100%\n"
            b"rename from src/x\n"
            b"rename to .github/actions/pwn/action.yml\n"
        ),
        (
            b"diff --git a/src/x b/src/x\n"
            b"similarity index 100%\n"
            b"copy from src/x\n"
            b"copy to .git/config\n"
        ),
    )
    for patch_bytes in patches:
        with pytest.raises(ValueError, match="forbidden path"):
            inspect_patch_bytes(patch_bytes)


def test_result_requires_consistent_status_and_bounded_reason_codes() -> None:
    """Successful evidence cannot carry a failing exit code or unbounded labels."""
    patch_bytes = _patch()
    request = _request(patch_bytes, "2" * 40)
    values = PatchValidationResult(
        status=PatchValidationStatus.PASSED,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="npm run release:verify",
        exit_code=0,
        duration_ms=1,
        stdout_excerpt="passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump()

    inconsistent = dict(values, exit_code=1)
    with pytest.raises(ValidationError):
        PatchValidationResult.model_validate(inconsistent)

    unbounded = dict(values, reason_codes=["x" * 129])
    with pytest.raises(ValidationError):
        PatchValidationResult.model_validate(unbounded)


def test_runner_rejects_source_revision_mismatch_before_docker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A clean checkout must match the request head before untrusted execution."""
    repository, head = _git_repository(tmp_path)
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes, "f" * 40 if head != "f" * 40 else "e" * 40)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(_args, **_kwargs):
        """Fail if a mismatched checkout reaches Docker."""
        raise AssertionError("Docker must not start for a mismatched source revision")

    with pytest.raises(RuntimeError, match="source HEAD does not match"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=request,
            source_root=repository,
            patch_path=patch_path,
        )


@pytest.mark.parametrize("dirty_kind", ["tracked", "untracked"])
def test_runner_rejects_non_exact_source_worktree_before_docker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    dirty_kind: str,
) -> None:
    """Tracked and untracked source drift cannot enter exact-head validation."""
    repository, head = _git_repository(tmp_path)
    if dirty_kind == "tracked":
        (repository / "src" / "example.ts").write_text(
            "attacker replacement\n",
            encoding="utf-8",
        )
    else:
        (repository / "src" / "injected.ts").write_text(
            "attacker addition\n",
            encoding="utf-8",
        )
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes, head)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(_args, **_kwargs):
        """Fail if a dirty checkout reaches Docker."""
        raise AssertionError("Docker must not start for a dirty source worktree")

    with pytest.raises(RuntimeError, match="source worktree is not clean"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=request,
            source_root=repository,
            patch_path=patch_path,
        )


def test_runner_mounts_private_patch_copy_and_bounded_result_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Docker bounds evidence without choking realistic profile artifacts."""
    repository, head = _git_repository(tmp_path)
    patch_bytes = _patch()
    original_patch = tmp_path / "proposal.patch"
    original_patch.write_bytes(patch_bytes)
    request = _request(patch_bytes, head)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.setenv("PATH", "/trusted/bin")
    observed_mounts: list[tuple[Path, Path]] = []

    def fake_run(command, **kwargs):
        """Inspect private mounts and write exact-bound result evidence."""
        command_list = list(command)
        staged_patch = _mount_source(command_list, "/patch/input.patch,readonly")
        result_path = _mount_source(command_list, "/output/result.json")
        observed_mounts.append((staged_patch, result_path))
        assert staged_patch != original_patch
        assert staged_patch.read_bytes() == patch_bytes
        assert kwargs["stdout"] is subprocess.DEVNULL
        assert kwargs["stderr"] is subprocess.DEVNULL
        mount_destinations = [
            argument.split(",dst=", 1)[1].split(",", 1)[0]
            for argument in command_list
            if argument.startswith("--mount=") and ",dst=" in argument
        ]
        assert "/output" not in mount_destinations
        assert "/output/result.json" in mount_destinations
        realistic_profile_artifact_bytes = 32 * 1024
        assert (
            patch_validation.MAX_RESULT_JSON_BYTES
            < realistic_profile_artifact_bytes
            <= patch_validation.MAX_SOURCE_ARCHIVE_FILE_BYTES
        )
        assert (
            f"--ulimit=fsize={patch_validation.MAX_SOURCE_ARCHIVE_FILE_BYTES}:"
            f"{patch_validation.MAX_SOURCE_ARCHIVE_FILE_BYTES}"
        ) in command_list
        result_path.write_text(
            _successful_result(request),
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0)

    result = DockerPatchValidationRunner(command_runner=fake_run).validate(
        request=request,
        source_root=repository,
        patch_path=original_patch,
    )

    assert result.status is PatchValidationStatus.PASSED
    assert len(observed_mounts) == 1
    staged_patch, result_path = observed_mounts[0]
    assert not staged_patch.exists()
    assert not result_path.exists()
