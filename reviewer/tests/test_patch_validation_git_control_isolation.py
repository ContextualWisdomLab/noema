"""Regression tests for isolating exact-commit archives from local Git metadata."""

from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

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
    """Return the host source for the validator's writable result mount."""
    suffix = ",dst=/output"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=type=bind,src=") and argument.endswith(suffix)
    )
    return Path(mount.removeprefix("--mount=type=bind,src=").removesuffix(suffix))


def test_local_git_info_attributes_cannot_rewrite_exact_commit_snapshot(
    tmp_path: Path,
    monkeypatch,
) -> None:
    """Host-local Git attributes must not omit bytes from the requested commit."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    (source / "kept.txt").write_text("committed bytes\n", encoding="utf-8")
    (source / "other.txt").write_text("old\n", encoding="utf-8")
    _run_git(source, "add", "kept.txt", "other.txt")
    _run_git(source, "commit", "-m", "test exact source")
    head_sha = _run_git(source, "rev-parse", "HEAD")

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
        output_directory = _output_source(command)
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
        (output_directory / "result.json").write_text(
            json.dumps(result),
            encoding="utf-8",
        )
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
