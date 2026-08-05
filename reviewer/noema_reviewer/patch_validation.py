"""Credential-free patch validation in an immutable sandbox image.

This module is deliberately narrower than a general-purpose CI runner. It
accepts one exact-head-bound, text-only Git patch and one allowlisted validation
profile. The source checkout and patch are mounted read-only; the validator
container receives no repository, reviewer, model, Cloudflare, Docker, or OIDC
credentials and has no network access. The container returns a bounded JSON
artifact that is revalidated against the request before it can influence a
review verdict.
"""

from __future__ import annotations

import hashlib
import os
import re
import shlex
import stat
import subprocess
import uuid
from collections.abc import Callable
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Any

from pydantic import BaseModel, Field, ValidationError


TRUSTED_PATCH_IMAGE_REPOSITORY = (
    "ghcr.io/contextualwisdomlab/noema-patch-validator"
)
TRUSTED_PATCH_IMAGE_RE = re.compile(
    rf"^{re.escape(TRUSTED_PATCH_IMAGE_REPOSITORY)}@sha256:[0-9a-f]{{64}}$"
)
PATCH_SANDBOX_WALL_TIMEOUT_SECONDS = 1200
MAX_PATCH_BYTES = 4 * 1024 * 1024
MAX_CHANGED_FILES = 100
MAX_DIAGNOSTIC_CHARS = 1000
MAX_RESULT_EXCERPT_CHARS = 4000
SHA1_PATTERN = r"^[0-9a-f]{40}$"
SHA256_PATTERN = r"^[0-9a-f]{64}$"
REPOSITORY_PATTERN = r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
PATCH_MODE_PATTERN = re.compile(
    r"^(?:old mode|new mode|new file mode|deleted file mode) (120000|160000)$",
    re.MULTILINE,
)
FORBIDDEN_PATCH_PATHS = frozenset(
    {
        ".gitmodules",
        ".github/CODEOWNERS",
        ".github/dependabot.yml",
        "CODEOWNERS",
    }
)
FORBIDDEN_PATCH_PREFIXES = (
    ".git/",
    ".github/actions/",
    ".github/workflows/",
)

ProcessRunner = Callable[..., subprocess.CompletedProcess[str]]
NameFactory = Callable[[], str]


class PatchValidationProfile(str, Enum):
    """Approved test command profiles baked into the validator image."""

    NODE_RELEASE_VERIFY = "node_release_verify"


class PatchValidationStatus(str, Enum):
    """Terminal outcomes emitted by the validator image."""

    PASSED = "passed"
    FAILED = "failed"
    BLOCKED = "blocked"


PROFILE_COMMANDS: dict[PatchValidationProfile, str] = {
    PatchValidationProfile.NODE_RELEASE_VERIFY: "npm run release:verify",
}


class PatchValidationRequest(BaseModel):
    """Exact revision and patch identity allowed to enter the sandbox."""

    repository_full_name: str = Field(pattern=REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=SHA1_PATTERN)
    head_sha: str = Field(pattern=SHA1_PATTERN)
    patch_sha256: str = Field(pattern=SHA256_PATTERN)
    profile: PatchValidationProfile


class PatchValidationResult(BaseModel):
    """Bounded, exact-request-bound evidence returned by the sandbox."""

    status: PatchValidationStatus
    repository_full_name: str = Field(pattern=REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=SHA1_PATTERN)
    head_sha: str = Field(pattern=SHA1_PATTERN)
    patch_sha256: str = Field(pattern=SHA256_PATTERN)
    profile: PatchValidationProfile
    command_profile: str = Field(min_length=1, max_length=200)
    exit_code: int = Field(ge=0, le=255)
    duration_ms: int = Field(ge=0)
    stdout_excerpt: str = Field(max_length=MAX_RESULT_EXCERPT_CHARS)
    stderr_excerpt: str = Field(max_length=MAX_RESULT_EXCERPT_CHARS)
    reason_codes: list[str] = Field(default_factory=list, max_length=20)


class _PatchFileSystem:
    """Injectable descriptor-safe filesystem operations for patch reads."""

    lstat = staticmethod(os.lstat)
    open = staticmethod(os.open)
    fstat = staticmethod(os.fstat)
    read = staticmethod(os.read)
    close = staticmethod(os.close)


DEFAULT_PATCH_FILE_SYSTEM = _PatchFileSystem()


def _bounded_detail(text: str) -> str:
    """Return a single bounded diagnostic for an infrastructure failure."""
    compact = text.strip() or "no diagnostic output"
    if len(compact) <= MAX_DIAGNOSTIC_CHARS:
        return compact
    omitted = len(compact) - MAX_DIAGNOSTIC_CHARS
    return f"{compact[:MAX_DIAGNOSTIC_CHARS]} [truncated {omitted} characters]"


def _default_name() -> str:
    """Return an unpredictable Docker-safe container name."""
    return f"noema-patch-{uuid.uuid4().hex}"


def _verified_image_reference() -> str:
    """Return the workflow-verified immutable patch-validator image."""
    image = os.environ.get("NOEMA_PATCH_SANDBOX_IMAGE", "").strip()
    if not TRUSTED_PATCH_IMAGE_RE.fullmatch(image):
        raise RuntimeError(
            "NOEMA_PATCH_SANDBOX_IMAGE must be a verified immutable "
            f"{TRUSTED_PATCH_IMAGE_REPOSITORY}@sha256 reference"
        )
    return image


def _validated_directory(raw_path: str | Path, label: str) -> Path:
    """Resolve one trusted bind-mount directory and reject Docker delimiters."""
    try:
        resolved = Path(raw_path).resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable: {exc}") from exc
    if not resolved.is_dir():
        raise RuntimeError(f"{label} must be a directory: {resolved}")
    if any(character in str(resolved) for character in (",", "\n", "\r")):
        raise RuntimeError(
            f"{label} contains characters unsafe for a Docker mount: {resolved}"
        )
    return resolved


def _absolute_without_following(raw_path: str | Path) -> Path:
    """Return an absolute path without resolving its final symlink component."""
    return Path(os.path.abspath(os.fspath(raw_path)))


def _read_regular_patch(
    raw_path: str | Path,
    *,
    file_system: Any = DEFAULT_PATCH_FILE_SYSTEM,
) -> tuple[Path, bytes]:
    """Read a stable bounded regular patch without following a symlink."""
    path = _absolute_without_following(raw_path)
    try:
        linked = file_system.lstat(path)
    except OSError as exc:
        raise RuntimeError(f"patch file is unavailable: {exc}") from exc
    if not stat.S_ISREG(linked.st_mode) or stat.S_ISLNK(linked.st_mode):
        raise RuntimeError("patch file must be a regular non-symlink file")
    if linked.st_size <= 0:
        raise RuntimeError("patch file must not be empty")
    if linked.st_size > MAX_PATCH_BYTES:
        raise RuntimeError(f"patch file exceeds {MAX_PATCH_BYTES} bytes")

    descriptor: int | None = None
    try:
        descriptor = file_system.open(
            path,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
        )
        opened = file_system.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise RuntimeError("patch file changed during validation")
        if opened.st_dev != linked.st_dev or opened.st_ino != linked.st_ino:
            raise RuntimeError("patch file changed during validation")

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = file_system.read(
                descriptor,
                min(65_536, MAX_PATCH_BYTES + 1 - total),
            )
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_PATCH_BYTES:
                raise RuntimeError(f"patch file exceeds {MAX_PATCH_BYTES} bytes")
        data = b"".join(chunks)
        if not data:
            raise RuntimeError("patch file must not be empty")
        return path, data
    except OSError as exc:
        raise RuntimeError(f"patch file could not be read safely: {exc}") from exc
    finally:
        if descriptor is not None:
            file_system.close(descriptor)


def _validated_patch_path(raw_path: str, prefix: str) -> str:
    """Normalize one diff header path and reject traversal or governance paths."""
    if not raw_path.startswith(prefix):
        raise ValueError("patch contains a malformed diff path")
    relative = raw_path[len(prefix) :]
    if (
        not relative
        or relative.startswith("/")
        or "\\" in relative
        or any(ord(character) < 32 or ord(character) == 127 for character in relative)
    ):
        raise ValueError("patch contains an unsafe repository path")
    pure_path = PurePosixPath(relative)
    if pure_path.is_absolute() or any(part in ("", ".", "..") for part in pure_path.parts):
        raise ValueError("patch contains an unsafe repository path")
    normalized = pure_path.as_posix()
    if normalized in FORBIDDEN_PATCH_PATHS or normalized.startswith(
        FORBIDDEN_PATCH_PREFIXES
    ):
        raise ValueError(f"patch targets forbidden path: {normalized}")
    return normalized


def inspect_patch_bytes(patch_bytes: bytes) -> tuple[str, ...]:
    """Return changed paths after strict text, mode, path, and size validation."""
    if not patch_bytes:
        raise ValueError("patch must not be empty")
    if len(patch_bytes) > MAX_PATCH_BYTES:
        raise ValueError(f"patch exceeds {MAX_PATCH_BYTES} bytes")
    try:
        text = patch_bytes.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise ValueError("patch must be valid UTF-8") from exc
    if "GIT binary patch" in text or "Binary files " in text:
        raise ValueError("binary patch payloads are not allowed")
    if PATCH_MODE_PATTERN.search(text):
        raise ValueError("patch contains a symlink or gitlink mode")

    changed_paths: list[str] = []
    for line in text.splitlines():
        if not line.startswith("diff --git "):
            continue
        try:
            parts = shlex.split(line)
        except ValueError as exc:
            raise ValueError("patch contains a malformed diff header") from exc
        if len(parts) != 4 or parts[:2] != ["diff", "--git"]:
            raise ValueError("patch contains a malformed diff header")
        _validated_patch_path(parts[2], "a/")
        target = _validated_patch_path(parts[3], "b/")
        if target in changed_paths:
            raise ValueError(f"patch repeats changed path: {target}")
        changed_paths.append(target)
        if len(changed_paths) > MAX_CHANGED_FILES:
            raise ValueError(f"patch changes more than {MAX_CHANGED_FILES} files")

    if not changed_paths:
        raise ValueError("patch contains no diff headers")
    return tuple(changed_paths)


def _result_matches_request(
    result: PatchValidationResult,
    request: PatchValidationRequest,
) -> bool:
    """Return whether result identity and allowlisted command match the request."""
    observed = (
        result.repository_full_name,
        result.base_sha,
        result.head_sha,
        result.patch_sha256,
        result.profile,
        result.command_profile,
    )
    expected = (
        request.repository_full_name,
        request.base_sha,
        request.head_sha,
        request.patch_sha256,
        request.profile,
        PROFILE_COMMANDS[request.profile],
    )
    return observed == expected


class DockerPatchValidationRunner:
    """Run one exact-bound patch through a hardened, no-network Docker profile."""

    def __init__(
        self,
        *,
        command_runner: ProcessRunner = subprocess.run,
        cleanup_runner: ProcessRunner = subprocess.run,
        name_factory: NameFactory = _default_name,
        file_system: Any = DEFAULT_PATCH_FILE_SYSTEM,
    ) -> None:
        """Initialize injectable process, cleanup, name, and filesystem adapters."""
        self._command_runner = command_runner
        self._cleanup_runner = cleanup_runner
        self._name_factory = name_factory
        self._file_system = file_system

    def validate(
        self,
        *,
        request: PatchValidationRequest,
        source_root: str | Path,
        patch_path: str | Path,
    ) -> PatchValidationResult:
        """Validate one patch and return exact-request-bound structured evidence."""
        source = _validated_directory(source_root, "source root")
        resolved_patch, patch_bytes = _read_regular_patch(
            patch_path,
            file_system=self._file_system,
        )
        inspect_patch_bytes(patch_bytes)
        observed_digest = hashlib.sha256(patch_bytes).hexdigest()
        if observed_digest != request.patch_sha256:
            raise RuntimeError(
                "patch file digest does not match the validation request"
            )
        image = _verified_image_reference()
        container_name = self._name_factory()
        uid = os.getuid()
        gid = os.getgid()
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
            f"--user={uid}:{gid}",
            (
                "--tmpfs=/workspace:"
                f"rw,nosuid,nodev,size=1073741824,mode=0700,uid={uid},gid={gid}"
            ),
            "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777",
            f"--mount=type=bind,src={source},dst=/input,readonly",
            (
                "--mount=type=bind,"
                f"src={resolved_patch},dst=/patch/input.patch,readonly"
            ),
            "--workdir=/workspace",
            "--env=HOME=/workspace/home",
            "--env=XDG_CACHE_HOME=/workspace/cache",
            f"--env=NOEMA_REPOSITORY={request.repository_full_name}",
            f"--env=NOEMA_BASE_SHA={request.base_sha}",
            f"--env=NOEMA_HEAD_SHA={request.head_sha}",
            f"--env=NOEMA_PATCH_SHA256={request.patch_sha256}",
            f"--env=NOEMA_PATCH_PROFILE={request.profile.value}",
            "--entrypoint=/opt/noema/bin/validate-patch",
            image,
        ]
        child_environment = {"PATH": os.environ.get("PATH", os.defpath)}
        try:
            completed = self._command_runner(
                command,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                shell=False,
                timeout=PATCH_SANDBOX_WALL_TIMEOUT_SECONDS,
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
                "patch validation sandbox timed out after "
                f"{PATCH_SANDBOX_WALL_TIMEOUT_SECONDS} seconds"
            ) from exc
        except OSError as exc:
            raise RuntimeError(
                f"patch validation sandbox could not start Docker: {exc}"
            ) from exc

        if completed.returncode != 0:
            detail = _bounded_detail(completed.stderr or completed.stdout)
            raise RuntimeError(
                f"patch validation sandbox exited {completed.returncode}: {detail}"
            )
        try:
            result = PatchValidationResult.model_validate_json(completed.stdout)
        except (ValidationError, ValueError) as exc:
            raise RuntimeError(
                "patch validation sandbox returned invalid structured evidence"
            ) from exc
        if not _result_matches_request(result, request):
            raise RuntimeError(
                "patch validation sandbox result does not match the request"
            )
        return result
