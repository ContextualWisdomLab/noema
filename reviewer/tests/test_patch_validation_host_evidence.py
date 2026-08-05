"""Host-generated evidence regressions for patch validation."""

from __future__ import annotations

import hashlib
from types import SimpleNamespace

import pytest

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


def _patch() -> bytes:
    """Return one minimal ordinary source patch."""
    return (
        b"diff --git a/src/example.ts b/src/example.ts\n"
        b"--- a/src/example.ts\n"
        b"+++ b/src/example.ts\n"
        b"@@ -1 +1 @@\n"
        b"-old\n"
        b"+new\n"
    )


def _request(patch_bytes: bytes) -> PatchValidationRequest:
    """Build one exact request for the test patch."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def test_success_evidence_is_constructed_by_the_trusted_host(
    tmp_path,
    monkeypatch,
) -> None:
    """Untrusted code receives no host-writable result path or result environment."""
    patch_bytes = _patch()
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    request = _request(patch_bytes)

    def successful(command, **kwargs):
        """Accept the hardened command without manufacturing result JSON."""
        command_list = list(command)
        bind_mounts = [
            argument
            for argument in command_list
            if argument.startswith("--mount=type=bind,")
        ]
        assert bind_mounts
        assert all(argument.endswith(",readonly") for argument in bind_mounts)
        assert not any("dst=/output" in argument for argument in command_list)
        assert not any("NOEMA_RESULT_PATH" in argument for argument in command_list)
        assert kwargs["stdout"] is patch_validation.subprocess.DEVNULL
        assert kwargs["stderr"] is patch_validation.subprocess.DEVNULL
        return SimpleNamespace(returncode=0)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    result = DockerPatchValidationRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidationStatus.PASSED
    assert result.repository_full_name == request.repository_full_name
    assert result.base_sha == request.base_sha
    assert result.head_sha == request.head_sha
    assert result.patch_sha256 == request.patch_sha256
    assert result.profile is request.profile
    assert result.command_profile == "npm run release:verify"
    assert result.exit_code == 0
    assert 0 <= result.duration_ms <= patch_validation.MAX_RESULT_DURATION_MS
    assert result.stdout_excerpt == ""
    assert result.stderr_excerpt == ""
    assert result.reason_codes == []


def test_nonzero_container_exit_cannot_be_replaced_by_forged_json(
    tmp_path,
    monkeypatch,
) -> None:
    """The Docker exit code remains authoritative when validation fails."""
    patch_bytes = _patch()
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)

    def failed(_command, **_kwargs):
        """Return the failing status observed by the trusted host."""
        return SimpleNamespace(returncode=7)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError, match="sandbox exited 7"):
        DockerPatchValidationRunner(command_runner=failed).validate(
            request=_request(patch_bytes),
            source_root=source,
            patch_path=patch_path,
        )
