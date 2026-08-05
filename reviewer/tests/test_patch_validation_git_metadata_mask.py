"""Git-control metadata isolation tests for the patch sandbox."""

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
    """Return one ordinary source patch."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode()


def _initialize_repository(path: Path) -> str:
    """Create one committed Git repository and return its exact HEAD."""
    path.mkdir()
    subprocess.run(["git", "init", "-q", str(path)], check=True)
    subprocess.run(
        ["git", "-C", str(path), "config", "user.email", "test@example.invalid"],
        check=True,
    )
    subprocess.run(
        ["git", "-C", str(path), "config", "user.name", "Noema Test"],
        check=True,
    )
    source = path / "src"
    source.mkdir()
    (source / "example.ts").write_text("old\n", encoding="utf-8")
    subprocess.run(["git", "-C", str(path), "add", "src/example.ts"], check=True)
    subprocess.run(
        ["git", "-C", str(path), "commit", "-qm", "fixture"],
        check=True,
    )
    subprocess.run(
        [
            "git",
            "-C",
            str(path),
            "remote",
            "add",
            "origin",
            "https://x-access-token:repository-secret@example.invalid/noema.git",
        ],
        check=True,
    )
    return subprocess.run(
        ["git", "-C", str(path), "rev-parse", "HEAD"],
        check=True,
        text=True,
        stdout=subprocess.PIPE,
    ).stdout.strip()


def _request(patch_bytes: bytes, head_sha: str) -> PatchValidationRequest:
    """Build one exact-head-bound request."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _result_json(request: PatchValidationRequest) -> str:
    """Return one exact-request-bound successful result."""
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
    """Return the host source for one Docker bind destination."""
    suffix = f",dst={destination}"
    mount = next(
        item
        for item in command
        if item.startswith("--mount=") and suffix in item
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


@pytest.mark.parametrize("checkout_kind", ["repository", "worktree"])
def test_runner_masks_git_control_metadata_from_untrusted_code(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    checkout_kind: str,
) -> None:
    """Repository credentials and worktree pointers are hidden by a nested mount."""
    repository = tmp_path / "repository"
    head = _initialize_repository(repository)
    if checkout_kind == "repository":
        source = repository
    else:
        source = tmp_path / "worktree"
        subprocess.run(
            ["git", "-C", str(repository), "worktree", "add", "-q", "--detach", str(source), head],
            check=True,
        )
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes, head)
    observed_masks: list[Path] = []

    def successful(command, **_kwargs):
        """Inspect the metadata mask and write bounded result evidence."""
        command_list = list(command)
        metadata_mask = _mount_source(command_list, "/input/.git,readonly")
        output_directory = _mount_source(command_list, "/output")
        observed_masks.append(metadata_mask)
        assert metadata_mask != source / ".git"
        assert "repository-secret" not in repr(command_list)
        if (source / ".git").is_dir():
            assert metadata_mask.is_dir()
            assert list(metadata_mask.iterdir()) == []
        else:
            assert metadata_mask.is_file()
            assert metadata_mask.read_bytes() == b""
        (output_directory / "result.json").write_text(
            _result_json(request),
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    result = DockerPatchValidationRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )
    assert result.status is PatchValidationStatus.PASSED
    assert len(observed_masks) == 1
    assert not observed_masks[0].exists()


def test_runner_rejects_symlinked_git_control_metadata_before_docker(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A symlink cannot redirect the trusted Git preflight outside the source root."""
    source = tmp_path / "source"
    source.mkdir()
    external_git = tmp_path / "external-git"
    external_git.mkdir()
    (source / ".git").symlink_to(external_git, target_is_directory=True)
    patch_bytes = _patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def should_not_run(_args, **_kwargs):
        """Fail if symlinked Git metadata reaches Docker."""
        raise AssertionError("Docker must not start")

    with pytest.raises(RuntimeError, match="Git metadata must not be a symlink"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes, "2" * 40),
            source_root=source,
            patch_path=patch_path,
        )
