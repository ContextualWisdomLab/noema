"""Tests for credential-free, allowlisted patch validation."""

from __future__ import annotations

import hashlib
import os
import re
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


def _request(
    patch_bytes: bytes,
    *,
    head_sha: str = HEAD_SHA,
) -> PatchValidationRequest:
    """Build a request bound to the exact test patch and commit identities."""
    return PatchValidationRequest(
        repository_full_name="ContextualWisdomLab/noema",
        base_sha=BASE_SHA,
        head_sha=head_sha,
        patch_sha256=hashlib.sha256(patch_bytes).hexdigest(),
        profile=PatchValidationProfile.NODE_RELEASE_VERIFY,
    )


def _run_git(source: Path, *arguments: str) -> str:
    """Run one deterministic non-shell Git command for a test repository."""
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


def _write_inputs(tmp_path: Path, patch_bytes: bytes) -> tuple[Path, Path, str]:
    """Create an authenticated clean Git source and regular patch file."""
    source = tmp_path / "source"
    source.mkdir()
    _run_git(source, "init", "-q")
    _run_git(source, "config", "user.email", "test@example.invalid")
    _run_git(source, "config", "user.name", "Noema Test")
    source_file = source / "src" / "example.ts"
    source_file.parent.mkdir()
    source_file.write_text("old value\n", encoding="utf-8")
    _run_git(source, "add", "src/example.ts")
    _run_git(source, "commit", "-qm", "fixture")
    head_sha = _run_git(source, "rev-parse", "HEAD")
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    return source, patch_path, head_sha


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


def _mount_source(command: list[str], destination: str) -> Path:
    """Return the host source for one exact Docker bind destination."""
    suffix = f",dst={destination}"
    mount = next(
        argument
        for argument in command
        if argument.startswith("--mount=") and suffix in argument
    )
    return Path(mount.split("src=", 1)[1].split(",dst=", 1)[0])


def _write_container_result(command: list[str], payload: str) -> None:
    """Write structured evidence through the production single-file channel."""
    _mount_source(command, "/output/result.json").write_text(
        payload,
        encoding="utf-8",
    )


def _metadata(
    *,
    mode: int | None = None,
    size: int = 4,
    device: int = 11,
    inode: int = 13,
):
    """Return synthetic stat metadata for descriptor-race tests."""
    return SimpleNamespace(
        st_mode=patch_validation.stat.S_IFREG | 0o600 if mode is None else mode,
        st_size=size,
        st_dev=device,
        st_ino=inode,
    )


def _file_system(**overrides):
    """Return injectable patch filesystem operations with deterministic reads."""
    chunks = iter([b"safe", b""])
    defaults = {
        "lstat": lambda _path: _metadata(),
        "open": lambda _path, _flags: 7,
        "fstat": lambda _descriptor: _metadata(),
        "read": lambda _descriptor, _size: next(chunks),
        "close": lambda _descriptor: None,
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


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
    quoted = b'diff --git "a/src/file name.ts" "b/src/file name.ts"\n'
    assert inspect_patch_bytes(quoted) == ("src/file name.ts",)


@pytest.mark.parametrize(
    ("patch_bytes", "message"),
    (
        (b"", "must not be empty"),
        (b"\xff", "valid UTF-8"),
        (
            b"diff --git a/link b/link\nnew file mode 120000\n",
            "symlink or gitlink",
        ),
        (
            b"diff --git a/submodule b/submodule\ndeleted file mode 160000\n",
            "symlink or gitlink",
        ),
        (
            b"diff --git a/.github/workflows/pwn.yml b/.github/workflows/pwn.yml\n",
            "forbidden path",
        ),
        (
            b"diff --git a/.github/actions/pwn/action.yml b/.github/actions/pwn/action.yml\n",
            "forbidden path",
        ),
        (
            b"diff --git a/.git/config b/.git/config\n",
            "forbidden path",
        ),
        (
            b"diff --git a/.gitmodules b/.gitmodules\n",
            "forbidden path",
        ),
        (
            b"diff --git a/../outside b/../outside\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a//absolute b//absolute\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a/src\\evil b/src\\evil\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a/src/\x01evil b/src/\x01evil\n",
            "unsafe repository path",
        ),
        (
            b"diff --git a/src/a.bin b/src/a.bin\nGIT binary patch\n",
            "binary patch",
        ),
        (
            b"diff --git a/src/a.bin b/src/a.bin\nBinary files differ\n",
            "binary patch",
        ),
        (b"ordinary text only\n", "no diff headers"),
        (b'diff --git "a/src/x b/src/x\n', "malformed diff header"),
        (b"diff --git a/src/x\n", "malformed diff header"),
        (b"diff --git c/src/x b/src/x\n", "malformed diff path"),
        (b"diff --git a/ b/\n", "unsafe repository path"),
    ),
)
def test_patch_inspector_rejects_unsafe_patch_shapes(
    patch_bytes: bytes,
    message: str,
) -> None:
    """Malformed text, modes, paths, governance files, and binaries fail closed."""
    with pytest.raises(ValueError, match=message):
        inspect_patch_bytes(patch_bytes)


def test_patch_inspector_rejects_size_duplicates_and_file_count() -> None:
    """Patch bytes, duplicate paths, and file cardinality have explicit limits."""
    with pytest.raises(ValueError, match="exceeds"):
        inspect_patch_bytes(b"x" * (patch_validation.MAX_PATCH_BYTES + 1))

    duplicate = (
        b"diff --git a/src/x b/src/x\n"
        b"diff --git a/src/x b/src/x\n"
    )
    with pytest.raises(ValueError, match="repeats changed path"):
        inspect_patch_bytes(duplicate)

    many = b"".join(
        f"diff --git a/src/f{index} b/src/f{index}\n".encode()
        for index in range(patch_validation.MAX_CHANGED_FILES + 1)
    )
    with pytest.raises(ValueError, match="more than"):
        inspect_patch_bytes(many)


def test_internal_diagnostics_and_names_are_bounded_and_unique() -> None:
    """Infrastructure helpers emit deterministic bounds and Docker-safe names."""
    assert patch_validation._bounded_detail("") == "no diagnostic output"
    assert patch_validation._bounded_detail(" short ") == "short"
    first = patch_validation._default_name()
    second = patch_validation._default_name()
    assert re.fullmatch(r"noema-patch-[0-9a-f]{32}", first)
    assert first != second


@pytest.mark.parametrize("kind", ["missing", "file", "unsafe"])
def test_runner_rejects_invalid_source_mount(tmp_path, monkeypatch, kind: str) -> None:
    """Missing, non-directory, and Docker-ambiguous source roots fail closed."""
    patch_bytes = _patch()
    request = _request(patch_bytes)
    patch_path = tmp_path / "proposal.patch"
    patch_path.write_bytes(patch_bytes)
    if kind == "missing":
        source = tmp_path / "missing"
        message = "unavailable"
    elif kind == "file":
        source = tmp_path / "source-file"
        source.write_text("x", encoding="utf-8")
        message = "must be a directory"
    else:
        source = tmp_path / "unsafe,source"
        source.mkdir()
        message = "unsafe for a Docker mount"
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    with pytest.raises(RuntimeError, match=message):
        DockerPatchValidationRunner().validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )


def test_descriptor_safe_patch_reader_rejects_invalid_metadata(tmp_path) -> None:
    """Every pre-open and post-open patch metadata anomaly is rejected."""
    path = tmp_path / "proposal.patch"
    path.write_bytes(b"safe")

    cases = (
        (
            _file_system(lstat=lambda _path: (_ for _ in ()).throw(FileNotFoundError("gone"))),
            "unavailable",
        ),
        (
            _file_system(lstat=lambda _path: _metadata(mode=patch_validation.stat.S_IFDIR)),
            "regular non-symlink",
        ),
        (
            _file_system(lstat=lambda _path: _metadata(size=0)),
            "must not be empty",
        ),
        (
            _file_system(
                lstat=lambda _path: _metadata(size=patch_validation.MAX_PATCH_BYTES + 1)
            ),
            "exceeds",
        ),
        (
            _file_system(fstat=lambda _descriptor: _metadata(mode=patch_validation.stat.S_IFDIR)),
            "changed during validation",
        ),
        (
            _file_system(fstat=lambda _descriptor: _metadata(device=99)),
            "changed during validation",
        ),
        (
            _file_system(fstat=lambda _descriptor: _metadata(inode=99)),
            "changed during validation",
        ),
    )
    for file_system, message in cases:
        with pytest.raises(RuntimeError, match=message):
            patch_validation._read_regular_patch(path, file_system=file_system)


def test_descriptor_safe_patch_reader_bounds_reads_and_closes(tmp_path) -> None:
    """Read growth, empty descriptors, and I/O errors close assigned descriptors."""
    path = tmp_path / "proposal.patch"
    path.write_bytes(b"safe")
    closed: list[int] = []

    oversized_chunks = iter([b"x" * (patch_validation.MAX_PATCH_BYTES + 1)])
    oversized = _file_system(
        read=lambda _descriptor, _size: next(oversized_chunks),
        close=lambda descriptor: closed.append(descriptor),
    )
    with pytest.raises(RuntimeError, match="exceeds"):
        patch_validation._read_regular_patch(path, file_system=oversized)
    assert closed == [7]

    closed.clear()
    empty = _file_system(
        read=lambda _descriptor, _size: b"",
        close=lambda descriptor: closed.append(descriptor),
    )
    with pytest.raises(RuntimeError, match="must not be empty"):
        patch_validation._read_regular_patch(path, file_system=empty)
    assert closed == [7]

    closed.clear()
    read_error = _file_system(
        read=lambda _descriptor, _size: (_ for _ in ()).throw(OSError("read failed")),
        close=lambda descriptor: closed.append(descriptor),
    )
    with pytest.raises(RuntimeError, match="could not be read safely"):
        patch_validation._read_regular_patch(path, file_system=read_error)
    assert closed == [7]

    close_calls: list[int] = []
    open_error = _file_system(
        open=lambda _path, _flags: (_ for _ in ()).throw(OSError("open failed")),
        close=lambda descriptor: close_calls.append(descriptor),
    )
    with pytest.raises(RuntimeError, match="could not be read safely"):
        patch_validation._read_regular_patch(path, file_system=open_error)
    assert close_calls == []


def test_descriptor_safe_patch_reader_returns_exact_bytes(tmp_path) -> None:
    """A stable descriptor returns its exact bytes and is always closed."""
    path = tmp_path / "proposal.patch"
    path.write_bytes(b"safe")
    chunks = iter([b"sa", b"fe", b""])
    closed: list[int] = []
    file_system = _file_system(
        read=lambda _descriptor, _size: next(chunks),
        close=lambda descriptor: closed.append(descriptor),
    )
    resolved, data = patch_validation._read_regular_patch(
        path,
        file_system=file_system,
    )
    assert resolved == path.absolute()
    assert data == b"safe"
    assert closed == [7]


def test_runner_launches_exact_hardened_profile_without_parent_secrets(
    tmp_path,
    monkeypatch,
) -> None:
    """The model patch runs in one immutable, networkless, credential-free image."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    calls: list[tuple[list[str], dict[str, object]]] = []

    def fake_run(args, **kwargs):
        """Capture private mounts and write exact-bound file evidence."""
        command = list(args)
        source_snapshot = _mount_source(command, "/input,readonly")
        assert source_snapshot != source.resolve()
        assert (source_snapshot / "src" / "example.ts").read_text(
            encoding="utf-8"
        ) == "old value\n"
        _write_container_result(command, _result_json(request))
        calls.append((command, kwargs))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

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
    patch_mount = next(
        part
        for part in command
        if part.startswith("--mount=") and ",dst=/patch/input.patch,readonly" in part
    )
    assert str(patch_path.resolve()) not in patch_mount
    destinations = tuple(
        part.split(",dst=", 1)[1].split(",", 1)[0]
        for part in command
        if part.startswith("--mount=") and ",dst=" in part
    )
    assert "/output" not in destinations
    assert destinations.count("/output/result.json") == 1
    assert f"--env=NOEMA_REPOSITORY={request.repository_full_name}" in command
    assert f"--env=NOEMA_BASE_SHA={request.base_sha}" in command
    assert f"--env=NOEMA_HEAD_SHA={request.head_sha}" in command
    assert f"--env=NOEMA_PATCH_SHA256={request.patch_sha256}" in command
    assert "--env=NOEMA_PATCH_PROFILE=node_release_verify" in command
    assert command[-1] == TEST_IMAGE
    assert kwargs["shell"] is False
    assert kwargs["timeout"] == patch_validation.PATCH_SANDBOX_WALL_TIMEOUT_SECONDS
    assert kwargs["env"] == {"PATH": "/trusted/bin"}
    assert kwargs["stdout"] is subprocess.DEVNULL
    assert kwargs["stderr"] is subprocess.DEVNULL
    assert not any("docker.sock" in part for part in command)
    assert "github-secret" not in repr((command, kwargs))
    assert "model-secret" not in repr((command, kwargs))
    assert "nim-secret" not in repr((command, kwargs))


def test_runner_rejects_patch_digest_mismatch_before_docker(tmp_path, monkeypatch) -> None:
    """A substituted patch never reaches the container runtime."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
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
    source, _unused_patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    target = tmp_path / "target.patch"
    target.write_bytes(patch_bytes)
    patch_path = tmp_path / "symlink-proposal.patch"
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
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)

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
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    mismatched = PatchValidationResult.model_validate_json(_result_json(request))
    mismatched.head_sha = "3" * 40

    def fake_run(args, **_kwargs):
        """Write a result whose head binding differs from the request."""
        _write_container_result(list(args), mismatched.model_dump_json())
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError, match="does not match the request"):
        DockerPatchValidationRunner(command_runner=fake_run).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_rejects_invalid_structured_evidence_and_missing_docker(
    tmp_path,
    monkeypatch,
) -> None:
    """Malformed file evidence and a missing Docker client become visible failures."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)

    def invalid_json(args, **_kwargs):
        """Write invalid structured evidence through the bounded file channel."""
        _write_container_result(list(args), "not-json")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    with pytest.raises(RuntimeError, match="invalid structured evidence"):
        DockerPatchValidationRunner(command_runner=invalid_json).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )

    def missing_docker(_args, **_kwargs):
        """Simulate an unavailable Docker client."""
        raise FileNotFoundError("docker missing")

    with pytest.raises(RuntimeError, match="could not start Docker"):
        DockerPatchValidationRunner(command_runner=missing_docker).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )


def test_runner_cleans_up_timed_out_container(tmp_path, monkeypatch) -> None:
    """A host wall timeout force-removes the unpredictable container name."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
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


@pytest.mark.parametrize(
    ("stdout", "stderr", "expected"),
    (
        ("", "x" * 5000, "truncated"),
        ("", "", "no diagnostic output"),
        ("stdout failure", "", "stdout failure"),
    ),
)
def test_runner_bounds_nonzero_container_diagnostic(
    tmp_path,
    monkeypatch,
    stdout: str,
    stderr: str,
    expected: str,
) -> None:
    """Attacker-controlled or silent process diagnostics remain bounded."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)

    def failed(_args, **_kwargs):
        """Return the selected non-zero sandbox diagnostic."""
        return SimpleNamespace(returncode=9, stdout=stdout, stderr=stderr)

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    with pytest.raises(RuntimeError) as captured:
        DockerPatchValidationRunner(command_runner=failed).validate(
            request=request,
            source_root=source,
            patch_path=patch_path,
        )
    assert "exited 9" in str(captured.value)
    assert expected in str(captured.value)
    assert len(str(captured.value)) < 1500


def test_runner_uses_default_path_when_parent_path_is_absent(
    tmp_path,
    monkeypatch,
) -> None:
    """Docker receives only a deterministic PATH even when the parent lacks one."""
    patch_bytes = _patch()
    source, patch_path, head_sha = _write_inputs(tmp_path, patch_bytes)
    request = _request(patch_bytes, head_sha=head_sha)
    observed: dict[str, object] = {}

    def successful(args, **kwargs):
        """Capture the child environment and write bounded file evidence."""
        observed.update(kwargs)
        _write_container_result(list(args), _result_json(request))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    monkeypatch.setenv("NOEMA_PATCH_SANDBOX_IMAGE", TEST_IMAGE)
    monkeypatch.delenv("PATH", raising=False)
    result = DockerPatchValidationRunner(command_runner=successful).validate(
        request=request,
        source_root=source,
        patch_path=patch_path,
    )
    assert result.status is PatchValidationStatus.PASSED
    assert observed["env"] == {"PATH": os.defpath}
