"""Adversarial regression tests for patch-validation trust boundaries."""

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


BASE_SHA = "1" * 40
HEAD_SHA = "2" * 40
TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)


def _safe_patch() -> bytes:
    """Return a minimal patch whose declared target is ordinary source code."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "index 1111111..2222222 100644\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    ).encode()


def _request(patch_bytes: bytes) -> PatchValidationRequest:
    """Build an exact request for one test patch."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha=BASE_SHA,
        head_sha=HEAD_SHA,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _result_json(request: PatchValidationRequest) -> str:
    """Return one exact-request-bound successful result document."""
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
    """Return the host source path for one Docker bind destination."""
    suffix = f",dst={destination}"
    mount = next(
        part
        for part in command
        if part.startswith("--mount=") and suffix in part
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


@pytest.mark.parametrize(
    "patch_bytes",
    (
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"--- a/src/example.ts\n"
            b"+++ b/.github/workflows/pwn.yml\n"
        ),
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"rename from src/example.ts\n"
            b"rename to .github/actions/pwn/action.yml\n"
        ),
        (
            b"diff --git a/src/example.ts b/src/example.ts\n"
            b"copy from src/example.ts\n"
            b"copy to docs/CODEOWNERS\n"
        ),
    ),
)
def test_patch_inspector_rejects_hidden_governance_targets(patch_bytes: bytes) -> None:
    """Secondary Git headers cannot redirect a safe diff header into governance."""
    with pytest.raises(ValueError, match="forbidden path"):
        inspect_patch_bytes(patch_bytes)


@pytest.mark.parametrize(
    ("patch_bytes", "message"),
    (
        (
            b"diff --git a/src/x b/src/x\n"
            b"--- a/src/x\n"
            b"+++ b/src\\evil\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a/src/x b/src/x\n"
            b"--- a/src/x\n"
            b'+++ "b/src/unterminated\n',
            "malformed diff header",
        ),
        (
            b"diff --git a/src/x b/src/x\n"
            b"--- a/src/x\n"
            b'+++ "b/src/x" "b/src/y"\n',
            "malformed diff header",
        ),
        (
            b"diff --git a/src/x b/src/x\n"
            b"--- a/src/x\n"
            b'+++ b/src/"x\n',
            "malformed diff header",
        ),
    ),
)
def test_patch_inspector_rejects_malformed_secondary_paths(
    patch_bytes: bytes,
    message: str,
) -> None:
    """Quoted and escaped auxiliary path syntax is validated fail closed."""
    with pytest.raises(ValueError, match=message):
        inspect_patch_bytes(patch_bytes)


def test_patch_inspector_accepts_quoted_secondary_paths_and_dev_null() -> None:
    """Valid quoted names and Git's deletion sentinel remain supported."""
    quoted = (
        b'diff --git "a/src/file name.ts" "b/src/file name.ts"\n'
        b'--- "a/src/file name.ts"\n'
        b'+++ "b/src/file name.ts"\n'
    )
    deleted = (
        b"diff --git a/src/x b/src/x\n"
        b"--- a/src/x\n"
        b"+++ /dev/null\n"
    )
    assert inspect_patch_bytes(quoted) == ("src/file name.ts",)
    assert inspect_patch_bytes(deleted) == ("src/x",)


def test_runner_stages_docker_ambiguous_original_patch_path(
    tmp_path,
    monkeypatch,
) -> None:
    """A comma-bearing caller path is replaced by a private safe mount source."""
    patch_bytes = _safe_patch()
    request = _request(patch_bytes)
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal,readonly=false.patch"
    patch_path.write_bytes(patch_bytes)
    observed: list[tuple[Path, Path]] = []

    def successful(command, **kwargs):
        """Verify safe staging and write the bounded result artifact."""
        staged_patch = _mount_source(list(command), "/patch/input.patch,readonly")
        output_directory = _mount_source(list(command), "/output")
        observed.append((staged_patch, output_directory))
        assert staged_patch != patch_path
        assert "," not in str(staged_patch)
        assert staged_patch.read_bytes() == patch_bytes
        assert str(patch_path) not in repr(command)
        assert kwargs["stdout"] is subprocess.DEVNULL
        assert kwargs["stderr"] is subprocess.DEVNULL
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
    staged_patch, output_directory = observed[0]
    assert not staged_patch.exists()
    assert not output_directory.exists()


def test_request_and_result_models_reject_unknown_fields() -> None:
    """Unknown wire fields fail closed instead of being silently discarded."""
    request = _request(_safe_patch())
    request_values = request.model_dump()
    request_values["arbitrary_command"] = "curl attacker.invalid"
    with pytest.raises(ValidationError):
        PatchValidationRequest.model_validate(request_values)

    result_values = {
        "status": PatchValidationStatus.PASSED,
        "repository_full_name": request.repository_full_name,
        "base_sha": request.base_sha,
        "head_sha": request.head_sha,
        "patch_sha256": request.patch_sha256,
        "profile": request.profile,
        "command_profile": "npm run release:verify",
        "exit_code": 0,
        "duration_ms": 1,
        "stdout_excerpt": "ok",
        "stderr_excerpt": "",
        "reason_codes": [],
        "unreviewed_evidence": True,
    }
    with pytest.raises(ValidationError):
        PatchValidationResult.model_validate(result_values)


def test_result_model_bounds_duration_and_reason_codes() -> None:
    """Result metadata cannot smuggle unbounded integers or diagnostic strings."""
    request = _request(_safe_patch())
    values = {
        "status": PatchValidationStatus.BLOCKED,
        "repository_full_name": request.repository_full_name,
        "base_sha": request.base_sha,
        "head_sha": request.head_sha,
        "patch_sha256": request.patch_sha256,
        "profile": request.profile,
        "command_profile": "npm run release:verify",
        "exit_code": 1,
        "duration_ms": patch_validation.PATCH_SANDBOX_WALL_TIMEOUT_SECONDS * 1000 + 1,
        "stdout_excerpt": "",
        "stderr_excerpt": "",
        "reason_codes": ["x"],
    }
    with pytest.raises(ValidationError):
        PatchValidationResult.model_validate(values)

    values["duration_ms"] = 1
    values["reason_codes"] = ["x" * 65]
    with pytest.raises(ValidationError):
        PatchValidationResult.model_validate(values)


def test_runner_rejects_oversized_result_file(tmp_path, monkeypatch) -> None:
    """The writable output mount cannot return an oversized evidence document."""
    patch_bytes = _safe_patch()
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)

    def oversized(command, **_kwargs):
        """Write a regular result file just beyond the accepted byte ceiling."""
        output_directory = _mount_source(list(command), "/output")
        (output_directory / "result.json").write_bytes(
            b"x" * (patch_validation.MAX_RESULT_JSON_BYTES + 1)
        )
        return SimpleNamespace(returncode=0)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError, match="result exceeds"):
        DockerPatchValidationRunner(command_runner=oversized).validate(
            request=_request(patch_bytes),
            source_root=source,
            patch_path=patch_path,
        )
