"""Regressions that keep untrusted image code outside host evidence production."""

from __future__ import annotations

import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest

from noema_reviewer import patch_image_validation, patch_validation
from noema_reviewer.patch_image_validation import (
    DockerPatchValidatorImageRunner,
    PatchValidatorImageProfile,
    PatchValidatorImageRequest,
    PatchValidatorImageStatus,
)


TEST_IMAGE_DIGEST = "sha256:" + "a" * 64
TEST_IMAGE = f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}@{TEST_IMAGE_DIGEST}"
PATCH_BYTES = (
    b"diff --git a/src/example.ts b/src/example.ts\n"
    b"--- a/src/example.ts\n"
    b"+++ b/src/example.ts\n"
    b"@@ -1 +1 @@\n"
    b"-old value\n"
    b"+new value\n"
)


def _request() -> PatchValidatorImageRequest:
    """Return one exact image-validation request for isolation tests."""
    return PatchValidatorImageRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=hashlib.sha256(PATCH_BYTES).hexdigest(),
        profile=PatchValidatorImageProfile.NODE_PATCH_VERIFY,
    )


def _install_host_boundaries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Path, Path]:
    """Install deterministic exact-source adapters without trusting image output."""
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(PATCH_BYTES)

    monkeypatch.setattr(
        patch_validation,
        "_validated_directory",
        lambda _path, _label: source,
    )
    monkeypatch.setattr(
        patch_validation,
        "_read_regular_patch",
        lambda _path, **_kwargs: (patch_path, PATCH_BYTES),
    )
    monkeypatch.setattr(
        patch_validation,
        "_verified_image_reference",
        lambda: TEST_IMAGE,
    )
    monkeypatch.setattr(
        patch_validation,
        "_git_metadata_kind",
        lambda _source: "directory",
    )
    monkeypatch.setattr(
        patch_validation,
        "_verify_source_head",
        lambda *_args, **_kwargs: None,
    )

    def materialize(_source, _head_sha, staging_root, _metadata_kind):
        """Create one private source mount for the captured Docker command."""
        source_mount = staging_root / "source"
        source_mount.mkdir()
        (source_mount / ".git").mkdir()
        return source_mount

    monkeypatch.setattr(
        patch_validation,
        "_materialize_committed_source",
        materialize,
    )

    def stage_patch(staging_root, patch_bytes):
        """Create the private staged patch expected by the image runner."""
        staged_patch = staging_root / "input.patch"
        staged_patch.write_bytes(patch_bytes)
        return staged_patch

    monkeypatch.setattr(
        patch_validation,
        "_write_private_patch_copy",
        stage_patch,
    )

    def metadata_mask(staging_root, _metadata_kind):
        """Create the empty nested Git metadata mask required by the runner."""
        mask = staging_root / "git-mask"
        mask.mkdir()
        return mask

    monkeypatch.setattr(
        patch_validation,
        "_create_git_metadata_mask",
        metadata_mask,
    )

    def reject_container_result(*_args, **_kwargs):
        """Prove the trusted host never parses attacker-writable image output."""
        raise AssertionError("container result must not be trusted as host evidence")

    monkeypatch.setattr(
        patch_validation,
        "_read_result_payload",
        reject_container_result,
    )
    monkeypatch.setattr(patch_image_validation.os, "getuid", lambda: 1000)
    monkeypatch.setattr(patch_image_validation.os, "getgid", lambda: 1000)
    return source, patch_path


def test_runner_synthesizes_passed_evidence_without_host_writable_result_mount(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A successful container exit becomes host evidence without trusting its files."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    captured_command: list[str] = []

    def successful_container(command, **_kwargs):
        """Capture the exact Docker boundary and report one successful exit."""
        captured_command.extend(command)
        return SimpleNamespace(returncode=0)

    request = _request()
    result = DockerPatchValidatorImageRunner(
        command_runner=successful_container,
        name_factory=lambda: "fixed-image-container",
    ).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidatorImageStatus.PASSED
    assert result.repository_full_name == request.repository_full_name
    assert result.base_sha == request.base_sha
    assert result.head_sha == request.head_sha
    assert result.patch_sha256 == request.patch_sha256
    assert result.profile is request.profile
    assert result.command_profile == "node_patch_verify_v1"
    assert result.validator_image_digest == TEST_IMAGE_DIGEST
    assert result.exit_code == 0
    assert result.stdout_excerpt == ""
    assert result.stderr_excerpt == ""
    assert result.reason_codes == []
    assert "--env=NOEMA_RESULT_PATH=/workspace/result.json" in captured_command
    assert not any("dst=/output/result.json" in argument for argument in captured_command)
