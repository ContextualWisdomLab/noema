"""Adversarial regression tests for patch-validation trust boundaries."""

from __future__ import annotations

import hashlib
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


def test_runner_rejects_docker_ambiguous_patch_mount(tmp_path, monkeypatch) -> None:
    """A patch filename cannot inject additional comma-delimited mount options."""
    patch_bytes = _safe_patch()
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal,readonly=false.patch"
    patch_path.write_bytes(patch_bytes)
    called = False

    def should_not_run(_args, **_kwargs):
        """Record an unsafe attempt to pass the ambiguous path to Docker."""
        nonlocal called
        called = True
        return SimpleNamespace(returncode=0, stdout="{}", stderr="")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError, match="unsafe for a Docker mount"):
        DockerPatchValidationRunner(command_runner=should_not_run).validate(
            request=_request(patch_bytes),
            source_root=source,
            patch_path=patch_path,
        )
    assert called is False


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
