"""Test-first contract for the repository-owned patch-validator image profile."""

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


TEST_IMAGE_DIGEST = "sha256:" + "a" * 64
TEST_IMAGE = f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}@{TEST_IMAGE_DIGEST}"


def _ordinary_patch(path: str = "src/example.ts") -> bytes:
    """Return one same-path ordinary text modification."""
    return (
        f"diff --git a/{path} b/{path}\n"
        "index 1111111..2222222 100644\n"
        f"--- a/{path}\n"
        f"+++ b/{path}\n"
        "@@ -1 +1 @@\n"
        "-old value\n"
        "+new value\n"
    ).encode("utf-8")


def _request(patch_bytes: bytes, head_sha: str) -> PatchValidationRequest:
    """Build an exact request for the image-owned Node profile."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_PATCH_VERIFY,
    )


def _run_git(source: Path, *arguments: str) -> str:
    """Run one bounded non-shell Git fixture command."""
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


def _inputs(tmp_path: Path) -> tuple[Path, Path, bytes, str]:
    """Create one clean authenticated source and ordinary patch."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.name", "Noema Test")
    _run_git(source, "config", "user.email", "noema-test@example.invalid")
    source_file = source / "src" / "example.ts"
    source_file.parent.mkdir()
    source_file.write_text("old value\n", encoding="utf-8")
    _run_git(source, "add", "--all")
    _run_git(source, "commit", "-qm", "fixture")
    head_sha = _run_git(source, "rev-parse", "HEAD")
    patch_bytes = _ordinary_patch()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    return source, patch_path, patch_bytes, head_sha


def _mount_source(command: list[str], destination: str) -> Path:
    """Resolve the host file mounted at one exact Docker destination."""
    suffix = f",dst={destination}"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=") and suffix in argument
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


def _result_json(
    request: PatchValidationRequest,
    *,
    validator_image_digest: str = TEST_IMAGE_DIGEST,
) -> str:
    """Return exact-request and exact-image-bound structured evidence."""
    return PatchValidationResult(
        status=PatchValidationStatus.PASSED,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="node_patch_verify_v1",
        validator_image_digest=validator_image_digest,
        exit_code=0,
        duration_ms=1,
        stdout_excerpt="passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump_json()


def test_node_image_profile_is_a_closed_non_shell_contract() -> None:
    """The image profile is enumerated and names an image-owned command contract."""
    assert PatchValidationProfile.NODE_PATCH_VERIFY.value == "node_patch_verify"
    assert (
        patch_validation.PROFILE_COMMANDS[PatchValidationProfile.NODE_PATCH_VERIFY]
        == "node_patch_verify_v1"
    )
    assert "npm" not in patch_validation.PROFILE_COMMANDS[
        PatchValidationProfile.NODE_PATCH_VERIFY
    ]
    assert " " not in patch_validation.PROFILE_COMMANDS[
        PatchValidationProfile.NODE_PATCH_VERIFY
    ]


def test_node_image_result_requires_an_immutable_image_digest() -> None:
    """Image-backed evidence cannot omit or forge its immutable validator digest."""
    patch_bytes = _ordinary_patch()
    request = _request(patch_bytes, "2" * 40)
    valid = _result_json(request)
    assert TEST_IMAGE_DIGEST in valid

    values = PatchValidationResult.model_validate_json(valid).model_dump()
    for invalid_digest in (None, "a" * 64, "sha256:short", "sha512:" + "a" * 128):
        candidate = dict(values)
        candidate["validator_image_digest"] = invalid_digest
        with pytest.raises(ValidationError):
            PatchValidationResult.model_validate(candidate)


def test_node_image_profile_accepts_ordinary_source_and_test_changes() -> None:
    """The first image profile accepts ordinary reviewed source and test patches."""
    for path in ("src/example.ts", "test/example.test.ts", "docs/example.md"):
        assert inspect_patch_bytes(
            _ordinary_patch(path),
            profile=PatchValidationProfile.NODE_PATCH_VERIFY,
        ) == (path,)


@pytest.mark.parametrize(
    "path",
    (
        "package.json",
        "package-lock.json",
        "tsconfig.json",
        "vitest.config.ts",
        ".npmrc",
        ".node-version",
        "Dockerfile.patch-validator",
        ".dockerignore.patch-validator",
        "reviewer/noema_reviewer/agent.py",
        "patch-validator/validate-patch.mjs",
        ".github/codegraph/package.json",
    ),
)
def test_node_image_profile_rejects_dependency_validator_and_config_paths(
    path: str,
) -> None:
    """A patch cannot alter the image dependency graph or its own validation controls."""
    with pytest.raises(ValueError, match="profile forbids path"):
        inspect_patch_bytes(
            _ordinary_patch(path),
            profile=PatchValidationProfile.NODE_PATCH_VERIFY,
        )


@pytest.mark.parametrize(
    "patch_bytes",
    (
        (
            "diff --git a/src/old.ts b/src/new.ts\n"
            "similarity index 100%\n"
            "rename from src/old.ts\n"
            "rename to src/new.ts\n"
        ).encode(),
        (
            "diff --git a/src/old.ts b/src/new.ts\n"
            "similarity index 100%\n"
            "copy from src/old.ts\n"
            "copy to src/new.ts\n"
        ).encode(),
        (
            "diff --git a/src/example.ts b/src/example.ts\n"
            "old mode 100644\n"
            "new mode 100755\n"
        ).encode(),
    ),
)
def test_node_image_profile_rejects_unsupported_metadata(
    patch_bytes: bytes,
) -> None:
    """The first runtime patch language excludes rename, copy, and mode operations."""
    with pytest.raises(ValueError, match="profile does not support"):
        inspect_patch_bytes(
            patch_bytes,
            profile=PatchValidationProfile.NODE_PATCH_VERIFY,
        )


def test_runner_rejects_result_from_another_image_digest(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A valid-looking result from another image cannot satisfy the exact request."""
    source, patch_path, patch_bytes, head_sha = _inputs(tmp_path)
    request = _request(patch_bytes, head_sha)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def forged_image_result(command, **_kwargs):
        """Write structurally valid evidence bound to a different image digest."""
        _mount_source(list(command), "/output/result.json").write_text(
            _result_json(request, validator_image_digest="sha256:" + "b" * 64),
            encoding="utf-8",
        )
        return SimpleNamespace(returncode=0)

    with pytest.raises(RuntimeError, match="does not match the request"):
        DockerPatchValidationRunner(command_runner=forged_image_result).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
