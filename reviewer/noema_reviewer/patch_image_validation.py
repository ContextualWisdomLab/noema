"""Repository-owned patch-validator image contracts and hardened Docker runner.

The older :mod:`noema_reviewer.patch_validation` module supplies the exact Git
source, archive, patch-file, and descriptor-safe result boundaries introduced
by PR #65.  This module composes those proven boundaries with a narrower,
versioned image profile whose result is additionally bound to the immutable
validator-image digest.  Keeping the image profile separate avoids changing the
legacy library contract while issue #66 is implemented and reviewed as a
stacked slice.
"""

from __future__ import annotations

import hashlib
import os
import shlex
import subprocess
import tempfile
from collections.abc import Callable
from enum import Enum
from pathlib import Path
from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from . import patch_validation as base


IMAGE_DIGEST_PATTERN = r"^sha256:[0-9a-f]{64}$"
IMAGE_PROFILE_FORBIDDEN_PATHS = frozenset(
    {
        ".npmrc",
        ".node-version",
        "Dockerfile.patch-validator",
        "Dockerfile.patch-validator.dockerignore",
        "package-lock.json",
        "package.json",
        "tsconfig.json",
        "vitest.config.ts",
    }
)
IMAGE_PROFILE_FORBIDDEN_PREFIXES = (
    ".github/",
    "patch-validator/",
    "reviewer/",
)
IMAGE_PROFILE_UNSUPPORTED_METADATA_PREFIXES = (
    "copy from ",
    "copy to ",
    "deleted file mode ",
    "new file mode ",
    "new mode ",
    "old mode ",
    "rename from ",
    "rename to ",
)

ImageProcessRunner = Callable[..., subprocess.CompletedProcess[str]]
ImageNameFactory = Callable[[], str]
ImageReasonCode = Annotated[
    str,
    Field(min_length=1, max_length=64, pattern=base.REASON_CODE_PATTERN),
]


class PatchValidatorImageProfile(str, Enum):
    """Versioned command profiles owned by the immutable validator image."""

    NODE_PATCH_VERIFY = "node_patch_verify"


class PatchValidatorImageStatus(str, Enum):
    """Terminal outcomes emitted by the repository-owned validator image."""

    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"


IMAGE_PROFILE_COMMANDS: dict[PatchValidatorImageProfile, str] = {
    PatchValidatorImageProfile.NODE_PATCH_VERIFY: "node_patch_verify_v1",
}


class PatchValidatorImageRequest(BaseModel):
    """Exact source, patch, and image-profile identity admitted to the sandbox."""

    model_config = ConfigDict(extra="forbid")

    repository_full_name: str = Field(pattern=base.REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=base.SHA1_PATTERN)
    head_sha: str = Field(pattern=base.SHA1_PATTERN)
    patch_sha256: str = Field(pattern=base.SHA256_PATTERN)
    profile: PatchValidatorImageProfile


class PatchValidatorImageResult(BaseModel):
    """Bounded evidence tied to one request and immutable validator digest."""

    model_config = ConfigDict(extra="forbid")

    status: PatchValidatorImageStatus
    repository_full_name: str = Field(pattern=base.REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=base.SHA1_PATTERN)
    head_sha: str = Field(pattern=base.SHA1_PATTERN)
    patch_sha256: str = Field(pattern=base.SHA256_PATTERN)
    profile: PatchValidatorImageProfile
    command_profile: str = Field(min_length=1, max_length=64)
    validator_image_digest: str = Field(pattern=IMAGE_DIGEST_PATTERN)
    exit_code: int = Field(ge=0, le=255)
    duration_ms: int = Field(ge=0, le=base.MAX_RESULT_DURATION_MS)
    stdout_excerpt: str = Field(max_length=base.MAX_RESULT_EXCERPT_CHARS)
    stderr_excerpt: str = Field(max_length=base.MAX_RESULT_EXCERPT_CHARS)
    reason_codes: list[ImageReasonCode] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def require_successful_exit_for_passed_status(self) -> Self:
        """Reject evidence claiming success for a nonzero fixed-command exit."""
        if self.status is PatchValidatorImageStatus.PASSED and self.exit_code != 0:
            raise ValueError("passed patch-validator image result requires exit_code 0")
        return self


def inspect_patch_for_image(patch_bytes: bytes) -> tuple[str, ...]:
    """Validate the common patch grammar plus the first image profile policy."""
    changed_paths = base.inspect_patch_bytes(patch_bytes)
    text = patch_bytes.decode("utf-8", errors="strict")
    lines = text.splitlines()

    for line in lines:
        if not line.startswith("diff --git "):
            continue
        parts = shlex.split(line)
        source_path = base._validated_patch_path(parts[2], "a/")
        target_path = base._validated_patch_path(parts[3], "b/")
        if source_path != target_path:
            raise ValueError(
                "patch-validator image profile does not support path-changing operations"
            )

    if any(
        line.startswith(IMAGE_PROFILE_UNSUPPORTED_METADATA_PREFIXES)
        for line in lines
    ):
        raise ValueError(
            "patch-validator image profile does not support rename, copy, or mode operations"
        )

    for path in changed_paths:
        if path in IMAGE_PROFILE_FORBIDDEN_PATHS or path.startswith(
            IMAGE_PROFILE_FORBIDDEN_PREFIXES
        ):
            raise ValueError(f"patch-validator image profile forbids path: {path}")
    return changed_paths


def _default_image_container_name() -> str:
    """Return one unpredictable Docker-safe validator container name."""
    return base._default_name().replace("noema-patch-", "noema-patch-image-", 1)


def _image_digest(image_reference: str) -> str:
    """Extract the already-regex-validated digest from an immutable reference."""
    return image_reference.rsplit("@", 1)[1]


def _result_matches_request(
    result: PatchValidatorImageResult,
    request: PatchValidatorImageRequest,
    validator_image_digest: str,
) -> bool:
    """Return whether evidence repeats every request and image-owned identity."""
    observed = (
        result.repository_full_name,
        result.base_sha,
        result.head_sha,
        result.patch_sha256,
        result.profile,
        result.command_profile,
        result.validator_image_digest,
    )
    expected = (
        request.repository_full_name,
        request.base_sha,
        request.head_sha,
        request.patch_sha256,
        request.profile,
        IMAGE_PROFILE_COMMANDS[request.profile],
        validator_image_digest,
    )
    return observed == expected


class DockerPatchValidatorImageRunner:
    """Run one image-profile patch in the exact-source hardened Docker boundary."""

    def __init__(
        self,
        *,
        command_runner: ImageProcessRunner = subprocess.run,
        cleanup_runner: ImageProcessRunner = subprocess.run,
        name_factory: ImageNameFactory = _default_image_container_name,
        file_system: Any = base.DEFAULT_PATCH_FILE_SYSTEM,
    ) -> None:
        """Initialize injectable Docker, cleanup, name, and filesystem adapters."""
        self._command_runner = command_runner
        self._cleanup_runner = cleanup_runner
        self._name_factory = name_factory
        self._file_system = file_system

    def validate(
        self,
        *,
        request: PatchValidatorImageRequest,
        source_root: str | Path,
        patch_path: str | Path,
    ) -> PatchValidatorImageResult:
        """Return exact-request and exact-image-bound structured validation evidence."""
        source = base._validated_directory(source_root, "source root")
        _resolved_patch, patch_bytes = base._read_regular_patch(
            patch_path,
            file_system=self._file_system,
        )
        inspect_patch_for_image(patch_bytes)
        if hashlib.sha256(patch_bytes).hexdigest() != request.patch_sha256:
            raise RuntimeError(
                "patch file digest does not match the image validation request"
            )

        image = base._verified_image_reference()
        validator_image_digest = _image_digest(image)
        metadata_kind = base._git_metadata_kind(source)
        base._verify_source_head(source, request.head_sha, metadata_kind)
        if metadata_kind is None:
            raise RuntimeError(
                "source Git metadata is required for exact-head image validation"
            )

        uid = os.getuid()
        gid = os.getgid()
        if uid <= 0 or gid <= 0:
            raise RuntimeError(
                "patch-validator image requires a non-root runner UID and GID"
            )
        container_name = self._name_factory()
        child_environment = {"PATH": os.environ.get("PATH", os.defpath)}

        with tempfile.TemporaryDirectory(
            prefix="noema-patch-validator-image-"
        ) as staging:
            staging_root = base._validated_docker_mount_path(
                Path(staging),
                "staging root",
            )
            source_mount = base._materialize_committed_source(
                source,
                request.head_sha,
                staging_root,
                metadata_kind,
            )
            staged_patch = base._write_private_patch_copy(staging_root, patch_bytes)
            git_metadata_mask = base._create_git_metadata_mask(
                staging_root,
                metadata_kind,
            )
            if git_metadata_mask is None:
                raise RuntimeError("source Git metadata mask could not be created")
            result_path = staging_root / "result.json"
            result_path.touch(mode=0o600)

            command = [
                "docker",
                "run",
                "--rm",
                f"--name={container_name}",
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
                "--ulimit=nofile=1024:1024",
                "--ulimit=nproc=256:256",
                "--ulimit=core=0:0",
                (
                    "--ulimit=fsize="
                    f"{base.MAX_SOURCE_ARCHIVE_FILE_BYTES}:"
                    f"{base.MAX_SOURCE_ARCHIVE_FILE_BYTES}"
                ),
                f"--user={uid}:{gid}",
                (
                    "--tmpfs=/workspace:"
                    f"rw,nosuid,nodev,size=1073741824,mode=0700,uid={uid},gid={gid}"
                ),
                "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777",
                f"--mount=type=bind,src={source_mount},dst=/input,readonly",
                (
                    "--mount=type=bind,"
                    f"src={git_metadata_mask},dst=/input/.git,readonly"
                ),
                (
                    "--mount=type=bind,"
                    f"src={staged_patch},dst=/patch/input.patch,readonly"
                ),
                (
                    "--mount=type=bind,"
                    f"src={result_path},dst=/output/result.json"
                ),
                "--workdir=/workspace",
                "--env=HOME=/workspace/home",
                "--env=XDG_CACHE_HOME=/workspace/cache",
                "--env=NOEMA_RESULT_PATH=/output/result.json",
                f"--env=NOEMA_REPOSITORY={request.repository_full_name}",
                f"--env=NOEMA_BASE_SHA={request.base_sha}",
                f"--env=NOEMA_HEAD_SHA={request.head_sha}",
                f"--env=NOEMA_PATCH_SHA256={request.patch_sha256}",
                f"--env=NOEMA_PATCH_PROFILE={request.profile.value}",
                (
                    "--env=NOEMA_COMMAND_PROFILE="
                    f"{IMAGE_PROFILE_COMMANDS[request.profile]}"
                ),
                f"--env=NOEMA_VALIDATOR_IMAGE_DIGEST={validator_image_digest}",
                image,
            ]

            try:
                completed = self._command_runner(
                    command,
                    text=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    shell=False,
                    timeout=base.PATCH_SANDBOX_WALL_TIMEOUT_SECONDS,
                    env=child_environment,
                )
            except subprocess.TimeoutExpired as exc:
                self._cleanup_runner(
                    ["docker", "rm", "-f", container_name],
                    text=True,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    check=False,
                    shell=False,
                    timeout=30,
                    env=child_environment,
                )
                raise RuntimeError(
                    "patch-validator image timed out after "
                    f"{base.PATCH_SANDBOX_WALL_TIMEOUT_SECONDS} seconds"
                ) from exc
            except OSError as exc:
                raise RuntimeError(
                    f"patch-validator image could not start Docker: {exc}"
                ) from exc

            if completed.returncode != 0:
                stderr = getattr(completed, "stderr", "") or ""
                stdout = getattr(completed, "stdout", "") or ""
                detail = base._bounded_detail(stderr or stdout)
                raise RuntimeError(
                    f"patch-validator image exited {completed.returncode}: {detail}"
                )

            result_payload = base._read_result_payload(
                result_path,
                completed,
                file_system=self._file_system,
            )
            try:
                result = PatchValidatorImageResult.model_validate_json(result_payload)
            except (ValidationError, ValueError) as exc:
                raise RuntimeError(
                    "patch-validator image returned invalid structured evidence"
                ) from exc
            if not _result_matches_request(
                result,
                request,
                validator_image_digest,
            ):
                raise RuntimeError(
                    "patch-validator image result does not match the request"
                )
            return result
