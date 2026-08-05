"""Tests for credential-free, allowlisted patch validation."""

from __future__ import annotations

import hashlib
import os
import subprocess
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


TEST_IMAGE = (
    f"{patch_validation.TRUSTED_PATCH_IMAGE_REPOSITORY}"
    f"@sha256:{'a' * 64}"
)
BASE_SHA = "1" * 40
HEAD_SHA = "2" * 40


def _patch(content: str = "+safe change\n") -> bytes:
    """Return a minimal text-only Git patch for one permitted source file."""
    return (
        "diff --git a/src/example.ts b/src/example.ts\n"
        "index 1111111..2222222 100644\n"
        "--- a/src/example.ts\n"
        "+++ b/src/example.ts\n"
        "@@ -1 +1 @@\n"
        "-old value\n"
        f"{content}"
    ).encode()


def _request(patch_bytes: bytes) -> PatchValidationRequest:
    """Build a request bound to the exact test patch and commit identities."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha=BASE_SHA,
        head_sha=HEAD_SHA,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _write_inputs(tmp_path, patch_bytes: bytes):
    """Create a source directory and regular patch file for a runner test."""
    source = tmp_path / "source"
    source.mkdir()
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    return source, patch_path


def _result_json(request: PatchValidationRequest) -> str:
    """Return one exact-binding successful container result."""
    return PatchValidationResult(
        status=PatchValidationStatus.PASSED,
        repository_full_name=request.repository_full_name,
        base_sha=request.base_sha,
        head_sha=request.head_sha,
        patch_sha256=request.patch_sha256,
        profile=request.profile,
        command_profile="npm run release:verify",
        exit_code=0,
        duration_ms=42,
        stdout_excerpt="all tests passed",
        stderr_excerpt="",
        reason_codes=[],
    ).model_dump_json()


def test_request_rejects_ambiguous_identity_and_arbitrary_profile() -> None:
    """Repository, commit, digest, and test profile are closed wire contracts."""
    patch_bytes = _patch()
    valid = _request(patch_bytes)
    assert valid.profile is PatchValidationProfile.NODE_RELEASE_VERIFY

    invalid_cases = (
        {"repository_full_name": "single-component"},
        {"base_sha": "ABC"},
        {"head_sha": "f" * 39},
        {"patch_sha256": "0" * 63},
        {"profile": "bash -lc 'curl attacker.invalid'"},
    )
    for override in invalid_cases:
        values = valid.model_dump()
        values.update(override)
        with pytest.raises(ValidationError):
            PatchValidationRequest.model_validate(values)


def test_patch_inspector_accepts_bounded_regular_source_patch() -> None:
    """A text-only source change yields the normalized changed-path tuple."""
    assert inspect_patch_bytes(_patch()) == ("src/example.ts",)


@pytest.mark.parametrize(
    ("patch_bytes", "message"),
    (
        (
            b"diff --git a/link b/link\nnew file mode 120000\n",
            "symlink or gitlink",
        ),
        (
            b"diff --git a/submodule b/submodule\nnew file mode 160000\n",
            "symlink or gitlink",
        ),
        (
            b"diff --git a/.github/workflows/pwn.yml b/.github/workflows/pwn.yml\n",
            "forbidden path",
        ),
        (
            b"diff --git a/../outside b/../outside\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a/src/a.bin b/src/a.bin\nGIT binary patch\n",
            "binary patch",
        ),
    ),
)
def test_patch_inspector_rejects_unsafe_patch_shapes(
    patch_bytes: bytes,
    message: str,
) -> None:
    """Special modes, traversal, governance files, and binary payloads fail closed."""
    with pytest.raises(ValueError, match=message):
        inspect_patch_bytes(patch_bytes)


def test_runner_launches_exact_hardened_profile_without_parent_secrets(
    tmp_path,
    monkeypatch,
) -> None:
    """The model patch runs in one immutable, networkless, credential-free image."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)
    calls: list[tuple[list[str], dict[str, object]]] = []

    def fake_run(args, **kwargs):
        """Capture the Docker boundary and return an exact-binding result."""
        calls.append((list(args), kwargs))
        return SimpleNamespace(
            returncode=0,
            stdout=_result_json(request),
            stderr="",
        )

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.setenv("GH_TOKEN", "github-secret")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "model-secret")
    monkeypatch.setenv("NVIDIA_NIM_API_KEY", "nim-secret")
    monkeypatch.setenv("PATH", "/trusted/bin")
    runner = DockerPatchValidationRunner(
        command_runner=fake_run,
        cleanup_runner=fake_run,
        name_factory=lambda: "fixed-patch-validator",
    )

    result = runner.validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )

    assert result.status is PatchValidationStatus.PASSED
    assert result.patch_sha256 == request.patch_sha256
    assert len(calls) == 1
    command, kwargs = calls[0]
    assert command[:3] == ["docker", "run", "--rm"]
    for required in (
        "--pull=never",
        "--network=none",
        "--read-only",
        "--cap-drop=ALL",
        "--security-opt=no-new-privileges=true",
        "--security-opt=seccomp=builtin",
        "--pids-limit=256",
        "--memory=2g",
        "--memory-swap=2g",
        "--cpus=2",
        "--ipc=none",
        "--entrypoint=/opt/noema/bin/validate-patch",
    ):
        assert required in command
    assert f"--mount=type=bind,src={source.resolve()},dst=/input,readonly" in command
    assert f"--mount=type=bind,src={patch_path.resolve()},dst=/patch/input.patch,readonly" in command
    assert f"--env=NOEMA_REPOSITORY={request.repository_full_name}" in command
    assert f"--env=NOEMA_BASE_SHA={request.base_sha}" in command
    assert f"--env=NOEMA_HEAD_SHA={request.head_sha}" in command
    assert f"--env=NOEMA_PATCH_SHA256={request.patch_sha256}" in command
    assert "--env=NOEMA_PATCH_PROFILE=node_release_verify" in command
    assert command[-1] == TEST_IMAGE
    assert kwargs["shell"] is False
    assert kwargs["timeout"] == patch_validation.PATCH_SANDBOX_WALL_TIMEOUT_SECONDS
    assert kwargs["env"] == {"PATH": "/trusted/bin"}
    assert not any("docker.sock" in part for part in command)
    assert "github-secret" not in repr((command, kwargs))
    assert "model-secret" not in repr((command, kwargs))
    assert "nim-secret" not in repr((command, kwargs))


def test_runner_rejects_patch_digest_mismatch_before_docker(tmp_path, monkeypatch) -> None:
    """A substituted patch never reaches the container runtime."""
    patch_bytes = _patch()
    source, patch_path = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes)
    patch_path.write_bytes(_patch("+substituted\n"))
    called = False

    def should_not_run(_args, **_kwargs):
        """Record an erroneous attempt to start Docker."""
        nonlocal called
        called = True
        raise AssertionError("Docker must not start")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    runner = DockerPatchValidationRunner(command_runner=should_not_run)
    with pytest.raises(RuntimeError, match="digest does not match"):
        runner.validate(request=request, source_root=source, patch_path=patch_path)
    assert called is False


def test_runner_rejects_symlink_patch_before_read(tmp_path, monkeypatch) -> None:
    """A symlink cannot redirect patch validation to an attacker-selected file."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source = tmp_path / "source"
    source.mkdir()
    target = tmp_path / "target.patch"
    target.write_bytes(patch_bytes)
    patch_path = tmp_path / "proposal.patch"
    patch_path.symlink_to(target)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    with pytest.raises(RuntimeError, match="regular non-symlink"):
        DockerPatchValidationRunner().validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_rejects_unverified_image(tmp_path, monkeypatch) -> None:
    """A mutable or foreign image reference cannot replace the reviewed sandbox."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)

    for invalid in (
        "",
        "ghcr.io/contextualwisdomlab/noema-patch-validator:latest",
        f"docker.io/library/node@sha256:{'a' * 64}",
    ):
        monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", invalid)
        with pytest.raises(RuntimeError, match="verified immutable"):
            DockerPatchValidationRunner().validate(
                request=request,
                source_root=source,
                patch_path=patch_path,
            )


def test_runner_rejects_container_result_bound_to_another_head(
    tmp_path,
    monkeypatch,
) -> None:
    """A structurally valid result for another revision is artifact substitution."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)
    mismatched = PatchValidationResult.model_validate_json(_result_json(request))
    mismatched.head_sha = "3" * 40

    def fake_run(_args, **_kwargs):
        """Return a result whose head binding differs from the request."""
        return SimpleNamespace(
            returncode=0,
            stdout=mismatched.model_dump_json(),
            stderr="",
        )

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError, match="does not match the request"):
        DockerPatchValidationRunner(command_runner=fake_run).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_cleans_up_timed_out_container(tmp_path, monkeypatch) -> None:
    """A host wall timeout force-removes the unpredictable container name."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)
    cleanup_calls: list[list[str]] = []

    def timed_out(args, **kwargs):
        """Simulate a validator exceeding the host wall-clock budget."""
        raise subprocess.TimeoutExpired(args, kwargs["timeout"])

    def cleanup(args, **_kwargs):
        """Capture forced removal of the timed-out sandbox."""
        cleanup_calls.append(list(args))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    runner = DockerPatchValidationRunner(
        command_runner=timed_out,
        cleanup_runner=cleanup,
        name_factory=lambda: "timed-out-patch-validator",
    )

    with pytest.raises(RuntimeError, match="timed out"):
        runner.validate(request=request, source_root=source, patch_path=patch_path)
    assert cleanup_calls == [
        ["docker", "rm", "-f", "timed-out-patch-validator"],
    ]


def test_runner_bounds_nonzero_container_diagnostic(tmp_path, monkeypatch) -> None:
    """Attacker-controlled container output cannot flood review evidence."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)

    def failed(_args, **_kwargs):
        """Return an overlong error from the sandbox process."""
        return SimpleNamespace(returncode=9, stdout="", stderr="x" * 5000)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError) as captured:
        DockerPatchValidationRunner(command_runner=failed).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
    assert "exited 9" in str(captured.value)
    assert "truncated" in str(captured.value)
    assert len(str(captured.value)) < 1500


def test_runner_uses_default_path_when_parent_path_is_absent(
    tmp_path,
    monkeypatch,
) -> None:
    """Docker receives only a deterministic PATH even when the parent lacks one."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    source, patch_path = _write_inputs(tmp_path, patch_bytes)
    observed: dict[str, object] = {}

    def successful(_args, **kwargs):
        """Capture the child environment for the missing-PATH case."""
        observed.update(kwargs)
        return SimpleNamespace(
            returncode=0,
            stdout=_result_json(request),
            stderr="",
        )

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.delenv("PATH", raising=False)
    result = DockerPatchValidationRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )
    assert result.status is PatchValidationStatus.PASSED
    assert observed["env"] == {"PATH": os.defpath}
