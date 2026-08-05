"""Source-checkout integrity regressions for patch validation."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_validation
from noema_reviewer.patch_validation import (
    DockerPatchValidationRunner,
    PatchValidationProfile,
    PatchValidationRequest,
    PatchValidationResult,
    PatchValidationStatus,
)


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _patch() -> bytes:
    """Return one ordinary text patch for a source-integrity test."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode()


def _request(
    patch_bytes: bytes,
    *,
    head_sha: str = "2" * 40,
) -> PatchValidationRequest:
    """Build one exact-head-bound request for source-integrity testing."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _run_git(source: Path, *arguments: str) -> str:
    """Run one bounded non-shell Git command for a temporary test repository."""
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


def _mount_source(command: list[str], destination: str) -> Path:
    """Return the host bind source for one exact Docker mount destination."""
    suffix = f",dst={destination}"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=") and suffix in argument
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


def _result_json(request: PatchValidationRequest) -> str:
    """Return one successful result document bound to the exact request."""
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


def test_runner_rejects_unverifiable_git_metadata_before_docker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An invalid Git control directory cannot masquerade as an exact checkout."""
    source = tmp_path / "source"
    source.mkdir()
    (source / ".git").mkdir()
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(_args, **_kwargs):
        """Fail if unverifiable source metadata reaches Docker."""
        raise AssertionError("Docker must not start")

    with pytest.raises(RuntimeError, match="source HEAD could not be verified"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes),
            source_root=source,
            patch_path=patch_path,
        )


def test_snapshot_materialization_rejects_git_archive_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A failed exact-commit archive cannot fall back to the mutable worktree."""
    monkeypatch.setattr(
        patch_validation.subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1),
    )
    staging = tmp_path / "staging"
    staging.mkdir()

    with pytest.raises(RuntimeError, match="snapshot could not be materialized"):
        patch_validation._materialize_committed_source(
            tmp_path,
            "2" * 40,
            staging,
            "directory",
        )


def test_snapshot_materialization_rejects_invalid_archive(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Malformed archive bytes fail closed and the transient archive is removed."""

    def corrupt_archive(command, **_kwargs):
        """Write invalid bytes at Git's requested archive output path."""
        output = next(
            argument.removeprefix("--output=")
            for argument in command
            if argument.startswith("--output=")
        )
        Path(output).write_bytes(b"not a tar archive")
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr(patch_validation.subprocess, "run", corrupt_archive)
    staging = tmp_path / "staging"
    staging.mkdir()

    with pytest.raises(RuntimeError, match="materialized safely"):
        patch_validation._materialize_committed_source(
            tmp_path,
            "2" * 40,
            staging,
            "file",
        )
    assert not (staging / "source.tar").exists()


def test_runner_mounts_committed_snapshot_after_post_preflight_mutation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Docker must receive committed bytes even when the worktree changes after preflight."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    tracked = source / "src" / "example.ts"
    tracked.parent.mkdir()
    tracked.write_text("trusted\n", encoding="utf-8")
    _run_git(source, "add", "src/example.ts")
    _run_git(source, "commit", "-m", "trusted source")
    head_sha = _run_git(source, "rev-parse", "HEAD")

    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    verified = patch_validation._verify_source_head

    def mutate_after_preflight(
        source_path: Path,
        expected_head_sha: str,
        metadata_kind: patch_validation.GitMetadataKind | None,
    ) -> None:
        """Mutate tracked content immediately after the trusted status check."""
        verified(source_path, expected_head_sha, metadata_kind)
        tracked.write_text("attacker-controlled\n", encoding="utf-8")

    monkeypatch.setattr(
        patch_validation,
        "_verify_source_head",
        mutate_after_preflight,
    )

    def inspect_snapshot(command, **_kwargs):
        """Require a private exact-commit source mount and emit bounded evidence."""
        command_list = list(command)
        mounted_source = _mount_source(command_list, "/input,readonly")
        output_directory = _mount_source(command_list, "/output")
        assert mounted_source != source
        assert (mounted_source / "src" / "example.ts").read_text(
            encoding="utf-8"
        ) == "trusted\n"
        (output_directory / "result.json").write_text(
            _result_json(request),
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0)

    result = DockerPatchValidationRunner(command_runner=inspect_snapshot).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )
    assert result.status is PatchValidationStatus.PASSED
