"""Test-first contract for the repository-owned patch-validator image profile."""

from __future__ import annotations

import hashlib
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from noema_reviewer import patch_validation
from noema_reviewer.patch_image_validation import (
    IMAGE_PROFILE_COMMANDS,
    DockerPatchValidatorImageRunner,
    PatchValidatorImageProfile,
    PatchValidatorImageRequest,
    PatchValidatorImageResult,
    PatchValidatorImageStatus,
    inspect_patch_for_image,
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


def _request(patch_bytes: bytes, head_sha: str) -> PatchValidatorImageRequest:
    """Build an exact request for the image-owned Node profile."""
    return PatchValidatorImageRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidatorImageProfile.NODE_PATCH_VERIFY,
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
    request: PatchValidatorImageRequest,
    *,
    validator_image_digest: str = TEST_IMAGE_DIGEST,
    status: PatchValidatorImageStatus = PatchValidatorImageStatus.PASSED,
    exit_code: int = 0,
) -> str:
    """Return exact-request and exact-image-bound structured evidence."""
    return PatchValidatorImageResult(
        status=status,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="node_patch_verify_v1",
        validator_image_digest=validator_image_digest,
        exit_code=exit_code,
        duration_ms=1,
        stdout_excerpt="passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump_json()


def test_node_image_profile_is_a_closed_non_shell_contract() -> None:
    """The image profile is enumerated and names an image-owned command contract."""
    assert PatchValidatorImageProfile.NODE_PATCH_VERIFY.value == "node_patch_verify"
    assert (
        IMAGE_PROFILE_COMMANDS[PatchValidatorImageProfile.NODE_PATCH_VERIFY]
        == "node_patch_verify_v1"
    )
    assert "npm" not in IMAGE_PROFILE_COMMANDS[
        PatchValidatorImageProfile.NODE_PATCH_VERIFY
    ]
    assert " " not in IMAGE_PROFILE_COMMANDS[
        PatchValidatorImageProfile.NODE_PATCH_VERIFY
    ]


def test_node_image_result_requires_an_immutable_image_digest() -> None:
    """Image-backed evidence cannot omit or forge its immutable validator digest."""
    patch_bytes = _ordinary_patch()
    request = _request(patch_bytes, "2" * 40)
    valid = _result_json(request)
    assert TEST_IMAGE_DIGEST in valid

    values = PatchValidatorImageResult.model_validate_json(valid).model_dump()
    for invalid_digest in (None, "a" * 64, "sha256:short", "sha512:" + "a" * 128):
        candidate = dict(values)
        candidate["validator_image_digest"] = invalid_digest
        with pytest.raises(ValidationError):
            PatchValidatorImageResult.model_validate(candidate)


def test_node_image_result_rejects_claimed_success_with_nonzero_exit() -> None:
    """The image cannot claim a passed result for a failing fixed command."""
    request = _request(_ordinary_patch(), "2" * 40)
    with pytest.raises(ValidationError, match="requires exit_code 0"):
        PatchValidatorImageResult.model_validate_json(
            _result_json(
                request,
                status=PatchValidatorImageStatus.FAILED,
                exit_code=1,
            ).replace('"status":"failed"', '"status":"passed"')
        )


def test_node_image_profile_accepts_ordinary_source_and_test_changes() -> None:
    """The first image profile accepts ordinary reviewed source and test patches."""
    for path in ("src/example.ts", "test/example.test.ts", "docs/example.md"):
        assert inspect_patch_for_image(_ordinary_patch(path)) == (path,)


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
        "Dockerfile.patch-validator.dockerignore",
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
        inspect_patch_for_image(_ordinary_patch(path))


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
        inspect_patch_for_image(patch_bytes)


def test_runner_accepts_exact_image_bound_result(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The runner accepts one successful result bound to the exact image digest."""
    source, patch_path, patch_bytes, head_sha = _inputs(tmp_path)
    request = _request(patch_bytes, head_sha)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def successful(command, **_kwargs):
        """Write exact evidence through the single result-file mount."""
        command_list = list(command)
        _mount_source(command_list, "/output/result.json").write_text(
            _result_json(request),
            encoding="utf-8",
        )
        assert "--network=none" in command_list
        assert "--read-only" in command_list
        assert "--cap-drop=ALL" in command_list
        assert "--env=NOEMA_VALIDATOR_IMAGE_DIGEST=" + TEST_IMAGE_DIGEST in command_list
        return SimpleNamespace(returncode=0)

    result = DockerPatchValidatorImageRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidatorImageStatus.PASSED
    assert result.validator_image_digest == TEST_IMAGE_DIGEST


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
        DockerPatchValidatorImageRunner(command_runner=forged_image_result).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
