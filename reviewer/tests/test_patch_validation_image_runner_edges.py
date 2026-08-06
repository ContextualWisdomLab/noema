"""Branch-complete failure tests for the image-bound patch-validation runner."""

from __future__ import annotations

import hashlib
import subprocess
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


def _request(*, patch_sha256: str | None = None) -> PatchValidatorImageRequest:
    """Return one exact request for deterministic runner-edge tests."""
    return PatchValidatorImageRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha="1" * 40,
        head_sha="2" * 40,
        patch_sha256=patch_sha256 or hashlib.sha256(PATCH_BYTES).hexdigest(),
        profile=PatchValidatorImageProfile.NODE_PATCH_VERIFY,
    )


def _install_host_boundaries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> tuple[Path, Path]:
    """Replace inherited Git boundaries with deterministic local test adapters."""
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
        """Create one minimal private source mount inside the active staging root."""
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
        """Create the private patch copy expected by the Docker command."""
        staged_patch = staging_root / "input.patch"
        staged_patch.write_bytes(patch_bytes)
        return staged_patch

    monkeypatch.setattr(
        patch_validation,
        "_write_private_patch_copy",
        stage_patch,
    )

    def metadata_mask(staging_root, _metadata_kind):
        """Create a deterministic empty Git metadata mask."""
        mask = staging_root / "git-mask"
        mask.mkdir()
        return mask

    monkeypatch.setattr(
        patch_validation,
        "_create_git_metadata_mask",
        metadata_mask,
    )
    monkeypatch.setattr(patch_image_validation.os, "getuid", lambda: 1000)
    monkeypatch.setattr(patch_image_validation.os, "getgid", lambda: 1000)
    return source, patch_path


def test_runner_rejects_patch_digest_mismatch(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Patch bytes must match the exact digest before image or Git processing."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)

    with pytest.raises(RuntimeError, match="digest does not match"):
        DockerPatchValidatorImageRunner().validate(
            request=_request(patch_sha256="0" * 64),
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_rejects_missing_git_metadata_after_preflight(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A missing metadata shape cannot become exact-head image evidence."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    monkeypatch.setattr(patch_validation, "_git_metadata_kind", lambda _source: None)

    with pytest.raises(RuntimeError, match="Git metadata is required"):
        DockerPatchValidatorImageRunner().validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )


@pytest.mark.parametrize(("uid", "gid"), ((0, 1000), (1000, 0)))
def test_runner_rejects_root_identity(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    uid: int,
    gid: int,
) -> None:
    """Both root UID and root GID are independently rejected before Docker."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    monkeypatch.setattr(patch_image_validation.os, "getuid", lambda: uid)
    monkeypatch.setattr(patch_image_validation.os, "getgid", lambda: gid)

    with pytest.raises(RuntimeError, match="non-root"):
        DockerPatchValidatorImageRunner().validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_rejects_missing_metadata_mask(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Docker cannot receive source until its nested Git metadata mask exists."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    monkeypatch.setattr(
        patch_validation,
        "_create_git_metadata_mask",
        lambda *_args, **_kwargs: None,
    )

    with pytest.raises(RuntimeError, match="mask could not be created"):
        DockerPatchValidatorImageRunner().validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_timeout_forces_bounded_cleanup(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A timed-out validator is force-removed with the same minimal environment."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    cleanup_calls: list[tuple[list[str], dict[str, object]]] = []

    def timeout(*_args, **_kwargs):
        """Emulate a container exceeding the fixed wall-time contract."""
        raise subprocess.TimeoutExpired("docker", 1)

    def cleanup(command, **kwargs):
        """Record bounded Docker cleanup without invoking a real daemon."""
        cleanup_calls.append((list(command), kwargs))
        return SimpleNamespace(returncode=0)

    with pytest.raises(RuntimeError, match="timed out"):
        DockerPatchValidatorImageRunner(
            command_runner=timeout,
            cleanup_runner=cleanup,
            name_factory=lambda: "fixed-image-container",
        ).validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )

    assert cleanup_calls[0][0] == [
        "docker",
        "rm",
        "-f",
        "fixed-image-container",
    ]
    assert cleanup_calls[0][1]["timeout"] == 30


def test_runner_wraps_docker_launch_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """An operating-system launch error is not mistaken for validation evidence."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)

    def fail_launch(*_args, **_kwargs):
        """Emulate Docker being unavailable on the trusted host."""
        raise OSError("docker unavailable")

    with pytest.raises(RuntimeError, match="could not start Docker"):
        DockerPatchValidatorImageRunner(command_runner=fail_launch).validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )


@pytest.mark.parametrize(
    "completed",
    (
        SimpleNamespace(returncode=7, stderr="validator failed", stdout=""),
        SimpleNamespace(returncode=8, stderr="", stdout="stdout failure"),
        SimpleNamespace(returncode=9),
    ),
)
def test_runner_rejects_nonzero_container_exit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    completed: SimpleNamespace,
) -> None:
    """Nonzero image exits fail visibly with bounded available diagnostics."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)

    with pytest.raises(RuntimeError, match=f"exited {completed.returncode}"):
        DockerPatchValidatorImageRunner(
            command_runner=lambda *_args, **_kwargs: completed
        ).validate(
            request=_request(),
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_ignores_container_text_and_measures_on_trusted_host(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Successful host evidence excludes attacker-controlled container text."""
    source, patch_path = _install_host_boundaries(tmp_path, monkeypatch)
    times = iter((1_000_000_000, 1_010_000_000))

    result = DockerPatchValidatorImageRunner(
        command_runner=lambda *_args, **_kwargs: SimpleNamespace(
            returncode=0,
            stdout='{"status":"passed","forged":true}',
            stderr="forged diagnostics",
        ),
        clock=lambda: next(times),
    ).validate(
        request=_request(),
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidatorImageStatus.PASSED
    assert result.duration_ms == 10
    assert result.stdout_excerpt == ""
    assert result.stderr_excerpt == ""
    assert result.reason_codes == []
