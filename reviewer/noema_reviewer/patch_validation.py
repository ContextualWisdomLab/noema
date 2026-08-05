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
import shutil
import stat
import subprocess
import tarfile
import tempfile
import uuid
from collections.abc import Callable
from enum import Enum
from pathlib import Path, PurePosixPath
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator


TRUSTED_PATCH_IMAGE_REPOSITORY = (
    "ghcr.io/contextualwisdomlab/noema-patch-validator"
)
TRUSTED_PATCH_IMAGE_RE = re.compile(
    rf"^{re.escape(TRUSTED_PATCH_IMAGE_REPOSITORY)}@sha256:[0-9a-f]{{64}}$"
)
TRUSTED_GIT_EXECUTABLE = shutil.which("git") or "/usr/bin/git"
PATCH_SANDBOX_WALL_TIMEOUT_SECONDS = 1200
MAX_PATCH_BYTES = 4 * 1024 * 1024
MAX_CHANGED_FILES = 100
MAX_SOURCE_ARCHIVE_MEMBERS = 20_000
MAX_SOURCE_ARCHIVE_MEMBER_BYTES = 64 * 1024 * 1024
MAX_SOURCE_ARCHIVE_FILE_BYTES = MAX_SOURCE_ARCHIVE_MEMBER_BYTES
MAX_SOURCE_ARCHIVE_TOTAL_BYTES = 512 * 1024 * 1024
MAX_GIT_CONTROL_FILE_BYTES = 4096
MAX_DIAGNOSTIC_CHARS = 1000
MAX_RESULT_EXCERPT_CHARS = 4000
MAX_RESULT_JSON_BYTES = 16 * 1024
MAX_RESULT_DURATION_MS = PATCH_SANDBOX_WALL_TIMEOUT_SECONDS * 1000
SHA1_PATTERN = r"^[0-9a-f]{40}$"
SHA256_PATTERN = r"^[0-9a-f]{64}$"
REPOSITORY_PATTERN = r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
REASON_CODE_PATTERN = r"^[a-z][a-z0-9_]{0,63}$"
PATCH_MODE_PATTERN = re.compile(
    r"^(?:old mode|new mode|new file mode|deleted file mode) (120000|160000)$",
    re.MULTILINE,
)
INDEX_MODE_PATTERN = re.compile(
    r"^index [0-9a-fA-F]{4,64}\.\.[0-9a-fA-F]{4,64}(?: ([0-9]{6}))?$"
)
HUNK_HEADER_PATTERN = re.compile(
    r"^@@ -(?P<old_start>[0-9]+)(?:,(?P<old_count>[0-9]+))? "
    r"\+(?P<new_start>[0-9]+)(?:,(?P<new_count>[0-9]+))? @@(?: .*)?$"
)
PERCENT_METADATA_PATTERN = re.compile(r"^(?:similarity|dissimilarity) index [0-9]{1,3}%$")
GIT_OBJECT_ID_PATTERN = re.compile(r"^(?:[0-9a-f]{40}|[0-9a-f]{64})$")
FORBIDDEN_PATCH_PATHS = frozenset(
    {
        ".gitmodules",
        ".github/CODEOWNERS",
        ".github/dependabot.yml",
        "CODEOWNERS",
        "docs/CODEOWNERS",
    }
)
FORBIDDEN_PATCH_PREFIXES = (
    ".git/",
    ".github/actions/",
    ".github/workflows/",
)
SECONDARY_PATCH_PATH_HEADERS = (
    ("--- ", "a/", True, "file", "source"),
    ("+++ ", "b/", True, "file", "target"),
    ("rename from ", None, False, "rename", "source"),
    ("rename to ", None, False, "rename", "target"),
    ("copy from ", None, False, "copy", "source"),
    ("copy to ", None, False, "copy", "target"),
)

ProcessRunner = Callable[..., subprocess.CompletedProcess[str]]
NameFactory = Callable[[], str]
GitMetadataKind = Literal["directory", "file"]
SecondaryPatchPathFamily = Literal["file", "rename", "copy"]
SecondaryPatchPathRole = Literal["source", "target"]
SourceArchiveEntryKind = Literal["directory", "file"]
SourceArchiveEntry = tuple[SourceArchiveEntryKind, int]
ReasonCode = Annotated[
    str,
    Field(min_length=1, max_length=64, pattern=REASON_CODE_PATTERN),
]


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

    model_config = ConfigDict(extra="forbid")

    repository_full_name: str = Field(pattern=REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=SHA1_PATTERN)
    head_sha: str = Field(pattern=SHA1_PATTERN)
    patch_sha256: str = Field(pattern=SHA256_PATTERN)
    profile: PatchValidationProfile


class PatchValidationResult(BaseModel):
    """Bounded, exact-request-bound evidence returned by the sandbox."""

    model_config = ConfigDict(extra="forbid")

    status: PatchValidationStatus
    repository_full_name: str = Field(pattern=REPOSITORY_PATTERN)
    base_sha: str = Field(pattern=SHA1_PATTERN)
    head_sha: str = Field(pattern=SHA1_PATTERN)
    patch_sha256: str = Field(pattern=SHA256_PATTERN)
    profile: PatchValidationProfile
    command_profile: str = Field(min_length=1, max_length=200)
    exit_code: int = Field(ge=0, le=255)
    duration_ms: int = Field(ge=0, le=MAX_RESULT_DURATION_MS)
    stdout_excerpt: str = Field(max_length=MAX_RESULT_EXCERPT_CHARS)
    stderr_excerpt: str = Field(max_length=MAX_RESULT_EXCERPT_CHARS)
    reason_codes: list[ReasonCode] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def require_successful_exit_for_passed_status(self) -> Self:
        """Reject evidence that claims success while reporting a failing command."""
        if self.status is PatchValidationStatus.PASSED and self.exit_code != 0:
            raise ValueError("passed patch validation requires exit_code 0")
        return self


class _PatchFileSystem:
    """Injectable descriptor-safe filesystem operations for bounded reads."""

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


def _validated_docker_mount_path(path: Path, label: str) -> Path:
    """Reject path characters that can alter Docker's comma-delimited mount grammar."""
    if any(character in str(path) for character in (",", "\n", "\r")):
        raise RuntimeError(
            f"{label} contains characters unsafe for a Docker mount: {path}"
        )
    return path


def _validated_directory(raw_path: str | Path, label: str) -> Path:
    """Resolve one trusted bind-mount directory and reject Docker delimiters."""
    try:
        resolved = Path(raw_path).resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable: {exc}") from exc
    if not resolved.is_dir():
        raise RuntimeError(f"{label} must be a directory: {resolved}")
    return _validated_docker_mount_path(resolved, label)


def _absolute_without_following(raw_path: str | Path) -> Path:
    """Return an absolute path without resolving its final symlink component."""
    return Path(os.path.abspath(os.fspath(raw_path)))


def _read_regular_patch(
    raw_path: str | Path,
    *,
    file_system: Any = DEFAULT_PATCH_FILE_SYSTEM,
    maximum_bytes: int = MAX_PATCH_BYTES,
    label: str = "patch file",
) -> tuple[Path, bytes]:
    """Read one stable bounded regular file without following its final path."""
    path = _absolute_without_following(raw_path)
    try:
        linked = file_system.lstat(path)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable: {exc}") from exc
    if not stat.S_ISREG(linked.st_mode) or stat.S_ISLNK(linked.st_mode):
        raise RuntimeError(f"{label} must be a regular non-symlink file")
    if linked.st_size <= 0:
        raise RuntimeError(f"{label} must not be empty")
    if linked.st_size > maximum_bytes:
        raise RuntimeError(f"{label} exceeds {maximum_bytes} bytes")

    descriptor: int | None = None
    try:
        descriptor = file_system.open(
            path,
            os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0),
        )
        opened = file_system.fstat(descriptor)
        if not stat.S_ISREG(opened.st_mode):
            raise RuntimeError(f"{label} changed during validation")
        if opened.st_dev != linked.st_dev or opened.st_ino != linked.st_ino:
            raise RuntimeError(f"{label} changed during validation")

        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = file_system.read(
                descriptor,
                min(65_536, maximum_bytes + 1 - total),
            )
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > maximum_bytes:
                raise RuntimeError(f"{label} exceeds {maximum_bytes} bytes")
        data = b"".join(chunks)
        if not data:
            raise RuntimeError(f"{label} must not be empty")
        return path, data
    except OSError as exc:
        raise RuntimeError(f"{label} could not be read safely: {exc}") from exc
    finally:
        if descriptor is not None:
            file_system.close(descriptor)


def _read_git_control_line(path: Path, label: str) -> str:
    """Read one stable bounded UTF-8 Git control line without following symlinks."""
    try:
        linked = os.lstat(path)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable") from exc
    if not stat.S_ISREG(linked.st_mode) or stat.S_ISLNK(linked.st_mode):
        raise RuntimeError(f"{label} must be a regular non-symlink file")
    if linked.st_size <= 0 or linked.st_size > MAX_GIT_CONTROL_FILE_BYTES:
        raise RuntimeError(f"{label} has an invalid byte length")

    descriptor: int | None = None
    try:
        descriptor = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
        opened = os.fstat(descriptor)
        if (
            not stat.S_ISREG(opened.st_mode)
            or opened.st_dev != linked.st_dev
            or opened.st_ino != linked.st_ino
        ):
            raise RuntimeError(f"{label} changed during validation")
        chunks: list[bytes] = []
        total = 0
        while True:
            chunk = os.read(
                descriptor,
                min(4096, MAX_GIT_CONTROL_FILE_BYTES + 1 - total),
            )
            if not chunk:
                break
            chunks.append(chunk)
            total += len(chunk)
            if total > MAX_GIT_CONTROL_FILE_BYTES:
                raise RuntimeError(f"{label} has an invalid byte length")
        data = b"".join(chunks)
    except OSError as exc:
        raise RuntimeError(f"{label} could not be read safely") from exc
    finally:
        if descriptor is not None:
            os.close(descriptor)

    try:
        text = data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise RuntimeError(f"{label} must be valid UTF-8") from exc
    line = text.removesuffix("\n")
    if not line or "\n" in line or "\r" in line or "\x00" in line:
        raise RuntimeError(f"{label} must contain one unambiguous line")
    return line


def _validated_git_directory(path: Path, label: str, *, require_exists: bool) -> Path:
    """Return a normalized Git control directory or fail closed when required."""
    absolute = _absolute_without_following(path)
    if any(character in str(absolute) for character in ("\x00", "\n", "\r")):
        raise RuntimeError(f"{label} contains unsafe path characters")
    if not require_exists:
        return absolute
    try:
        metadata = os.lstat(absolute)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable") from exc
    if stat.S_ISLNK(metadata.st_mode) or not stat.S_ISDIR(metadata.st_mode):
        raise RuntimeError(f"{label} must be a regular directory")
    return absolute


def _source_object_directory(
    source: Path,
    metadata_kind: GitMetadataKind,
    *,
    require_exists: bool,
) -> Path:
    """Resolve the primary object database without executing source-local Git config."""
    if metadata_kind == "directory":
        git_directory = source / ".git"
    else:
        gitfile = _read_git_control_line(source / ".git", "source Git file")
        if not gitfile.startswith("gitdir: ") or not gitfile.removeprefix("gitdir: "):
            raise RuntimeError("source Git file has an invalid gitdir record")
        raw_git_directory = Path(gitfile.removeprefix("gitdir: "))
        git_directory = (
            raw_git_directory
            if raw_git_directory.is_absolute()
            else source / raw_git_directory
        )
    git_directory = _validated_git_directory(
        git_directory,
        "source Git directory",
        require_exists=require_exists,
    )

    common_directory = git_directory
    commondir_path = git_directory / "commondir"
    try:
        os.lstat(commondir_path)
    except FileNotFoundError:
        pass
    except OSError as exc:
        raise RuntimeError("source Git common-directory record is unavailable") from exc
    else:
        commondir = Path(
            _read_git_control_line(
                commondir_path,
                "source Git common-directory record",
            )
        )
        common_directory = (
            commondir if commondir.is_absolute() else git_directory / commondir
        )
        common_directory = _validated_git_directory(
            common_directory,
            "source Git common directory",
            require_exists=require_exists,
        )

    return _validated_git_directory(
        common_directory / "objects",
        "source Git object directory",
        require_exists=require_exists,
    )


def _isolated_git_environment() -> dict[str, str]:
    """Return a minimal environment that disables host Git configuration channels."""
    return {
        "PATH": str(Path(TRUSTED_GIT_EXECUTABLE).parent),
        "GIT_CONFIG_NOSYSTEM": "1",
        "GIT_CONFIG_GLOBAL": os.devnull,
        "GIT_OPTIONAL_LOCKS": "0",
        "GIT_ATTR_NOSYSTEM": "1",
        "GIT_NO_REPLACE_OBJECTS": "1",
        "GIT_NO_LAZY_FETCH": "1",
    }


def _create_isolated_git_control(
    source: Path,
    head_sha: str,
    staging_root: Path,
    metadata_kind: GitMetadataKind,
    *,
    require_object_directory: bool,
) -> Path:
    """Create private Git control metadata backed only by content-addressed objects."""
    object_directory = _source_object_directory(
        source,
        metadata_kind,
        require_exists=require_object_directory,
    )
    control = staging_root / "isolated-git-control"
    objects_info = control / "objects" / "info"
    info = control / "info"
    refs = control / "refs" / "heads"
    objects_info.mkdir(parents=True, mode=0o700)
    info.mkdir(mode=0o700)
    refs.mkdir(parents=True, mode=0o700)
    (control / "config").write_text(
        "[core]\nrepositoryformatversion = 0\nbare = true\n",
        encoding="utf-8",
    )
    (control / "HEAD").write_text(f"{head_sha}\n", encoding="ascii")
    (objects_info / "alternates").write_text(
        f"{object_directory}\n",
        encoding="utf-8",
    )
    (info / "attributes").write_text(
        "* -export-ignore -export-subst\n",
        encoding="utf-8",
    )
    for control_file in (
        control / "config",
        control / "HEAD",
        objects_info / "alternates",
        info / "attributes",
    ):
        control_file.chmod(0o600)
    return control


def _validated_repository_path(raw_path: str) -> str:
    """Return one canonical repository-relative path or reject governed targets."""
    if (
        not raw_path
        or raw_path.startswith("/")
        or "\\" in raw_path
        or any(ord(character) < 32 or ord(character) == 127 for character in raw_path)
    ):
        raise ValueError("patch contains an unsafe repository path")
    pure_path = PurePosixPath(raw_path)
    normalized = pure_path.as_posix()
    if (
        pure_path.is_absolute()
        or normalized == "."
        or normalized != raw_path
        or any(part in ("", ".", "..") for part in pure_path.parts)
    ):
        raise ValueError("patch contains an unsafe repository path")
    if normalized in FORBIDDEN_PATCH_PATHS or normalized.startswith(
        FORBIDDEN_PATCH_PREFIXES
    ):
        raise ValueError(f"patch targets forbidden path: {normalized}")
    return normalized


def _validated_patch_path(raw_path: str, prefix: str) -> str:
    """Normalize one prefixed diff path and reject traversal or governance paths."""
    if not raw_path.startswith(prefix):
        raise ValueError("patch contains a malformed diff path")
    return _validated_repository_path(raw_path[len(prefix) :])


def _decoded_secondary_path(raw_path: str) -> str:
    """Decode one optional quoted metadata path without accepting escape sequences."""
    if "\\" in raw_path:
        raise ValueError("patch contains an unsafe repository path")
    if raw_path.startswith('"'):
        try:
            parts = shlex.split(raw_path)
        except ValueError as exc:
            raise ValueError("patch contains a malformed diff header") from exc
        if len(parts) != 1:
            raise ValueError("patch contains a malformed diff header")
        return parts[0]
    if '"' in raw_path:
        raise ValueError("patch contains a malformed diff header")
    return raw_path


def _validated_secondary_patch_header(
    line: str,
) -> tuple[SecondaryPatchPathFamily, SecondaryPatchPathRole, str | None] | None:
    """Return a normalized auxiliary metadata family, role, and optional path."""
    for marker, prefix, allows_dev_null, family, role in SECONDARY_PATCH_PATH_HEADERS:
        if not line.startswith(marker):
            continue
        raw_path = _decoded_secondary_path(line[len(marker) :])
        if allows_dev_null and raw_path == "/dev/null":
            return family, role, None
        normalized = (
            _validated_repository_path(raw_path)
            if prefix is None
            else _validated_patch_path(raw_path, prefix)
        )
        return family, role, normalized
    return None


def inspect_patch_bytes(patch_bytes: bytes) -> tuple[str, ...]:
    """Return changed paths after strict text, hunk, mode, path, and size validation."""
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
    lines = text.splitlines()
    if not any(line.startswith("diff --git ") for line in lines):
        raise ValueError("patch contains no diff headers")

    changed_paths: list[str] = []
    in_hunk = False
    old_remaining = 0
    new_remaining = 0
    previous_hunk_content = False
    newline_marker_seen = False
    current_diff_has_hunk = False
    current_source_path: str | None = None
    current_target_path: str | None = None
    secondary_paths: dict[
        SecondaryPatchPathFamily,
        dict[SecondaryPatchPathRole, tuple[bool, str | None]],
    ] = {}

    def reset_secondary_paths() -> None:
        """Reset independent file-header, rename, and copy metadata families."""
        secondary_paths.clear()
        for family in ("file", "rename", "copy"):
            secondary_paths[family] = {
                "source": (False, None),
                "target": (False, None),
            }

    def validate_secondary_pairs() -> None:
        """Validate each complete metadata family and canonical `/dev/null` use."""
        complete_families: set[SecondaryPatchPathFamily] = set()
        for family in ("file", "rename", "copy"):
            source_seen, source_path = secondary_paths[family]["source"]
            target_seen, target_path = secondary_paths[family]["target"]
            if source_seen != target_seen:
                raise ValueError("patch contains incomplete secondary path metadata")
            if not source_seen:
                continue
            complete_families.add(family)
            if source_path is None and target_path is None:
                raise ValueError("patch contains invalid /dev/null path metadata")
            if source_path is None:
                if (
                    family != "file"
                    or target_path != current_target_path
                    or current_source_path != current_target_path
                ):
                    raise ValueError("patch contains noncanonical creation metadata")
            elif target_path is None:
                if (
                    family != "file"
                    or source_path != current_source_path
                    or current_source_path != current_target_path
                ):
                    raise ValueError("patch contains noncanonical deletion metadata")
        if "rename" in complete_families and "copy" in complete_families:
            raise ValueError("patch contains conflicting rename and copy metadata")

    reset_secondary_paths()
    for line in lines:
        if in_hunk:
            if line == "\\ No newline at end of file":
                if not previous_hunk_content or newline_marker_seen:
                    raise ValueError("patch contains a malformed hunk newline marker")
                newline_marker_seen = True
                previous_hunk_content = False
                continue
            if old_remaining == 0 and new_remaining == 0:
                in_hunk = False
                previous_hunk_content = False
                newline_marker_seen = False
            else:
                if not line:
                    raise ValueError("patch contains a malformed hunk body")
                marker = line[0]
                if marker == " ":
                    old_remaining -= 1
                    new_remaining -= 1
                elif marker == "-":
                    old_remaining -= 1
                elif marker == "+":
                    new_remaining -= 1
                else:
                    raise ValueError("patch contains a malformed hunk body")
                if old_remaining < 0 or new_remaining < 0:
                    raise ValueError("patch hunk contains more lines than declared")
                previous_hunk_content = True
                newline_marker_seen = False
                continue

        if line.startswith("diff --git "):
            validate_secondary_pairs()
            current_diff_has_hunk = False
            reset_secondary_paths()
            if "\\" in line:
                raise ValueError("patch contains an unsafe repository path")
            try:
                parts = shlex.split(line)
            except ValueError as exc:
                raise ValueError("patch contains a malformed diff header") from exc
            if len(parts) != 4 or parts[:2] != ["diff", "--git"]:
                raise ValueError("patch contains a malformed diff header")
            current_source_path = _validated_patch_path(parts[2], "a/")
            current_target_path = _validated_patch_path(parts[3], "b/")
            if current_target_path in changed_paths:
                raise ValueError(f"patch repeats changed path: {current_target_path}")
            changed_paths.append(current_target_path)
            if len(changed_paths) > MAX_CHANGED_FILES:
                raise ValueError(f"patch changes more than {MAX_CHANGED_FILES} files")
            continue

        if line.startswith("@@"):
            if current_source_path is None or current_target_path is None:
                raise ValueError("patch hunk appears before a diff header")
            validate_secondary_pairs()
            match = HUNK_HEADER_PATTERN.fullmatch(line)
            if match is None:
                raise ValueError("patch contains a malformed hunk header")
            old_remaining = int(match.group("old_count") or "1")
            new_remaining = int(match.group("new_count") or "1")
            in_hunk = True
            previous_hunk_content = False
            newline_marker_seen = False
            current_diff_has_hunk = True
            continue

        secondary_path = _validated_secondary_patch_header(line)
        if secondary_path is not None:
            if current_source_path is None or current_target_path is None:
                raise ValueError("patch path metadata appears before a diff header")
            if current_diff_has_hunk:
                raise ValueError("patch contains path metadata after a hunk")
            family, role, normalized_path = secondary_path
            expected_path = current_source_path if role == "source" else current_target_path
            if normalized_path is not None and normalized_path != expected_path:
                raise ValueError(
                    "secondary patch path does not match the primary diff path"
                )
            seen, _previous_path = secondary_paths[family][role]
            if seen:
                raise ValueError(f"patch repeats {role} path metadata")
            secondary_paths[family][role] = (True, normalized_path)
            continue

        if line.startswith("index "):
            if current_source_path is None or current_diff_has_hunk:
                raise ValueError("patch contains misplaced index metadata")
            match = INDEX_MODE_PATTERN.fullmatch(line)
            if match is None:
                raise ValueError("patch contains malformed index metadata")
            mode = match.group(1)
            if mode in {"120000", "160000"}:
                raise ValueError("patch contains a symlink or gitlink mode")
            if mode is not None and mode not in {"100644", "100755"}:
                raise ValueError("patch contains an unsupported index mode")
            continue

        if line.startswith(("old mode ", "new mode ", "new file mode ", "deleted file mode ")):
            if current_source_path is None or current_diff_has_hunk:
                raise ValueError("patch contains misplaced mode metadata")
            if not line.endswith((" 100644", " 100755")):
                raise ValueError("patch contains an unsupported file mode")
            continue

        if line.startswith(("similarity index ", "dissimilarity index ")):
            if current_source_path is None or current_diff_has_hunk:
                raise ValueError("patch contains misplaced similarity metadata")
            if PERCENT_METADATA_PATTERN.fullmatch(line) is None:
                raise ValueError("patch contains malformed similarity metadata")
            percentage = int(line.rsplit(" ", 1)[1].removesuffix("%"))
            if percentage > 100:
                raise ValueError("patch contains malformed similarity metadata")
            continue

        if line == "":
            continue
        if line == "\\ No newline at end of file":
            raise ValueError("patch contains a malformed hunk newline marker")
        if line.startswith((" ", "+", "-")):
            raise ValueError("patch hunk contains more lines than declared")
        raise ValueError("patch contains unbound trailing syntax")

    if in_hunk and (old_remaining != 0 or new_remaining != 0):
        raise ValueError("patch hunk ended before its declared line counts")
    validate_secondary_pairs()
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


def _git_metadata_kind(source: Path) -> GitMetadataKind | None:
    """Return safe Git-control metadata shape or reject special-file redirection."""
    try:
        metadata = os.lstat(source / ".git")
    except FileNotFoundError:
        return None
    if stat.S_ISLNK(metadata.st_mode) or not (
        stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)
    ):
        raise RuntimeError(
            "source Git metadata must not be a symlink and must be a regular file or directory"
        )
    return "directory" if stat.S_ISDIR(metadata.st_mode) else "file"


def _verify_source_head(
    source: Path,
    expected_head_sha: str,
    metadata_kind: GitMetadataKind | None,
) -> None:
    """Reject source whose exact authenticated Git tree differs from the request."""
    if metadata_kind is None:
        raise RuntimeError("source Git metadata is required for exact-head validation")
    with tempfile.TemporaryDirectory(prefix="noema-git-preflight-") as staging:
        staging_root = Path(staging)
        try:
            control = _create_isolated_git_control(
                source,
                expected_head_sha,
                staging_root,
                metadata_kind,
                require_object_directory=True,
            )
        except RuntimeError as exc:
            raise RuntimeError("source HEAD could not be verified") from exc
        command_prefix = [
            TRUSTED_GIT_EXECUTABLE,
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            "-c",
            "core.untrackedCache=false",
            f"--git-dir={control}",
            f"--work-tree={source}",
        ]
        read_tree = subprocess.run(
            [*command_prefix, "read-tree", expected_head_sha],
            text=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=30,
            env=_isolated_git_environment(),
        )
        if read_tree.returncode != 0:
            raise RuntimeError(
                "source HEAD does not match the exact validation request"
            )
        completed = subprocess.run(
            [
                *command_prefix,
                "status",
                "--porcelain=v2",
                "--untracked-files=all",
                "--ignored=matching",
                "--",
                ".",
                ":(exclude).git",
            ],
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=30,
            env=_isolated_git_environment(),
        )
        if completed.returncode != 0:
            raise RuntimeError("source HEAD could not be verified")
        if completed.stdout:
            raise RuntimeError("source worktree is not clean")


def _validated_source_archive_name(raw_name: str) -> str:
    """Return one exact normalized archive path or reject aliasing and metadata."""
    candidate = raw_name[:-1] if raw_name.endswith("/") else raw_name
    if (
        not candidate
        or candidate.startswith("/")
        or "\\" in candidate
        or candidate == ".git"
        or candidate.startswith(".git/")
        or any(ord(character) < 32 or ord(character) == 127 for character in candidate)
    ):
        raise ValueError("source archive contains an unsafe member name")
    pure_path = PurePosixPath(candidate)
    normalized = pure_path.as_posix()
    if (
        pure_path.is_absolute()
        or any(part in ("", ".", "..") for part in pure_path.parts)
        or normalized != candidate
    ):
        raise ValueError("source archive contains an unsafe member name")
    return normalized


def _validated_exact_tree_output(raw_output: str) -> None:
    """Reject an unbounded, malformed, special, aliased, or oversized exact tree."""
    if not raw_output or not raw_output.endswith("\0"):
        raise ValueError("source exact tree output is empty or truncated")
    records = raw_output.split("\0")[:-1]
    if len(records) > MAX_SOURCE_ARCHIVE_MEMBERS:
        raise ValueError("source exact tree contains too many members")
    observed_paths: set[str] = set()
    total_file_bytes = 0
    for record in records:
        metadata, separator, raw_path = record.partition("\t")
        if not separator:
            raise ValueError("source exact tree contains malformed metadata")
        fields = metadata.split()
        if len(fields) != 4:
            raise ValueError("source exact tree contains malformed metadata")
        mode, object_type, object_id, raw_size = fields
        if (
            mode not in {"100644", "100755"}
            or object_type != "blob"
            or GIT_OBJECT_ID_PATTERN.fullmatch(object_id) is None
        ):
            raise ValueError("source exact tree contains a non-regular object")
        if not raw_size.isdecimal():
            raise ValueError("source exact tree contains an invalid blob size")
        size = int(raw_size)
        if size > MAX_SOURCE_ARCHIVE_MEMBER_BYTES:
            raise ValueError("source exact tree member exceeds its byte limit")
        total_file_bytes += size
        if total_file_bytes > MAX_SOURCE_ARCHIVE_TOTAL_BYTES:
            raise ValueError("source exact tree exceeds its aggregate byte limit")
        normalized = _validated_source_archive_name(raw_path)
        if normalized in observed_paths:
            raise ValueError("source exact tree repeats a member name")
        observed_paths.add(normalized)


def _verify_exact_tree_limits(control: Path, head_sha: str) -> None:
    """Check exact committed object bounds before Git can serialize an archive."""
    try:
        completed = subprocess.run(
            [
                TRUSTED_GIT_EXECUTABLE,
                "-c",
                "core.hooksPath=/dev/null",
                "-c",
                "core.fsmonitor=false",
                f"--git-dir={control}",
                "ls-tree",
                "-r",
                "-l",
                "-z",
                "--full-tree",
                head_sha,
            ],
            text=True,
            encoding="utf-8",
            errors="strict",
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            check=False,
            shell=False,
            timeout=30,
            env=_isolated_git_environment(),
        )
    except (OSError, subprocess.TimeoutExpired, UnicodeError) as exc:
        raise RuntimeError("source exact tree could not be inspected safely") from exc
    if completed.returncode != 0:
        raise RuntimeError("source exact tree could not be inspected safely")
    try:
        _validated_exact_tree_output(completed.stdout)
    except ValueError as exc:
        raise RuntimeError("source exact tree failed bounded validation") from exc


def _validated_source_archive_members(
    archive: tarfile.TarFile,
) -> tuple[list[tarfile.TarInfo], dict[str, SourceArchiveEntry]]:
    """Allowlist bounded regular-file and populated-directory archive entries."""
    members: list[tarfile.TarInfo] = []
    expected_entries: dict[str, SourceArchiveEntry] = {}
    declared_paths: set[str] = set()
    declared_directories: set[str] = set()
    total_file_bytes = 0

    for member in archive:
        if len(members) >= MAX_SOURCE_ARCHIVE_MEMBERS:
            raise ValueError("source archive contains too many members")
        normalized = _validated_source_archive_name(member.name)
        if normalized in declared_paths:
            raise ValueError("source archive repeats a member name")
        declared_paths.add(normalized)

        if member.isdir():
            entry: SourceArchiveEntry = ("directory", 0)
            declared_directories.add(normalized)
        elif member.isreg():
            if not 0 <= member.size <= MAX_SOURCE_ARCHIVE_MEMBER_BYTES:
                raise ValueError("source archive member exceeds its byte limit")
            total_file_bytes += member.size
            if total_file_bytes > MAX_SOURCE_ARCHIVE_TOTAL_BYTES:
                raise ValueError("source archive exceeds its aggregate byte limit")
            entry = ("file", member.size)
        else:
            raise ValueError("source archive contains a non-regular member")

        parent = PurePosixPath(normalized).parent
        while parent != PurePosixPath("."):
            parent_name = parent.as_posix()
            parent_entry = expected_entries.get(parent_name)
            if parent_entry is not None and parent_entry[0] == "file":
                raise ValueError("source archive places content below a regular file")
            expected_entries.setdefault(parent_name, ("directory", 0))
            parent = parent.parent

        previous_entry = expected_entries.get(normalized)
        if previous_entry is not None and (
            entry[0] == "file" or previous_entry[0] != "directory"
        ):
            raise ValueError("source archive contains a file-directory collision")
        expected_entries[normalized] = entry
        members.append(member)

    if not members:
        raise ValueError("source archive must contain at least one member")
    for directory in declared_directories:
        prefix = f"{directory}/"
        if not any(
            path != directory and path.startswith(prefix)
            for path in declared_paths
        ):
            raise ValueError("source archive contains an empty gitlink-like directory")
    return members, expected_entries


def _verify_materialized_snapshot(
    snapshot: Path,
    expected_entries: dict[str, SourceArchiveEntry],
) -> None:
    """Verify extracted paths, types, and sizes before the Docker bind mount."""
    observed_entries: dict[str, SourceArchiveEntry] = {}
    for extracted_path in snapshot.rglob("*"):
        relative_path = extracted_path.relative_to(snapshot).as_posix()
        metadata = os.lstat(extracted_path)
        if stat.S_ISLNK(metadata.st_mode) or not (
            stat.S_ISDIR(metadata.st_mode) or stat.S_ISREG(metadata.st_mode)
        ):
            raise ValueError("source snapshot contains a non-regular extracted entry")
        observed_entries[relative_path] = (
            ("directory", 0)
            if stat.S_ISDIR(metadata.st_mode)
            else ("file", metadata.st_size)
        )
    if observed_entries != expected_entries:
        raise ValueError("source snapshot does not match the validated archive")


def _materialize_committed_source(
    source: Path,
    head_sha: str,
    staging_root: Path,
    metadata_kind: GitMetadataKind,
) -> Path:
    """Materialize one private exact-commit snapshot without local Git controls."""
    archive_path = staging_root / "source.tar"
    snapshot = staging_root / "source"
    snapshot.mkdir(mode=0o700)
    try:
        control = _create_isolated_git_control(
            source,
            head_sha,
            staging_root,
            metadata_kind,
            require_object_directory=True,
        )
    except RuntimeError as exc:
        raise RuntimeError("source commit snapshot could not be materialized") from exc
    try:
        _verify_exact_tree_limits(control, head_sha)
    except RuntimeError as exc:
        raise RuntimeError(
            "source commit snapshot could not be materialized safely"
        ) from exc
    completed = subprocess.run(
        [
            TRUSTED_GIT_EXECUTABLE,
            "-c",
            "core.hooksPath=/dev/null",
            "-c",
            "core.fsmonitor=false",
            f"--git-dir={control}",
            "archive",
            "--format=tar",
            f"--output={archive_path}",
            head_sha,
        ],
        text=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
        shell=False,
        timeout=30,
        env=_isolated_git_environment(),
    )
    if completed.returncode != 0:
        raise RuntimeError("source commit snapshot could not be materialized")
    try:
        with tarfile.open(archive_path, mode="r:") as archive:
            members, expected_entries = _validated_source_archive_members(archive)
            archive.extractall(snapshot, members=members, filter="data")
        _verify_materialized_snapshot(snapshot, expected_entries)
    except (OSError, ValueError, tarfile.TarError) as exc:
        raise RuntimeError(
            "source commit snapshot could not be materialized safely"
        ) from exc
    finally:
        archive_path.unlink(missing_ok=True)

    metadata_placeholder = snapshot / ".git"
    if metadata_kind == "directory":
        metadata_placeholder.mkdir(mode=0o700)
    else:
        metadata_placeholder.touch(mode=0o400)
    return _validated_docker_mount_path(snapshot, "source snapshot")


def _create_git_metadata_mask(
    staging_root: Path,
    metadata_kind: GitMetadataKind | None,
) -> Path | None:
    """Create an empty nested bind source that hides checkout control metadata."""
    if metadata_kind is None:
        return None
    metadata_mask = staging_root / "git-metadata-mask"
    if metadata_kind == "directory":
        metadata_mask.mkdir(mode=0o700)
    else:
        metadata_mask.touch(mode=0o400)
    return metadata_mask


def _write_private_patch_copy(directory: Path, patch_bytes: bytes) -> Path:
    """Create one owner-only immutable-by-policy patch copy for the bind mount."""
    staged_patch = directory / "input.patch"
    staged_patch.write_bytes(patch_bytes)
    staged_patch.chmod(0o400)
    return staged_patch


def _read_result_payload(
    result_path: Path,
    _completed: subprocess.CompletedProcess[str] | None = None,
    *,
    file_system: Any = DEFAULT_PATCH_FILE_SYSTEM,
) -> bytes:
    """Return evidence only from the descriptor-safe 16 KiB result file."""
    _resolved, result_bytes = _read_regular_patch(
        result_path,
        file_system=file_system,
        maximum_bytes=MAX_RESULT_JSON_BYTES,
        label="patch validation result",
    )
    return result_bytes


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
        _resolved_patch, patch_bytes = _read_regular_patch(
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
        metadata_kind = _git_metadata_kind(source)
        _verify_source_head(source, request.head_sha, metadata_kind)
        if metadata_kind is None:
            raise RuntimeError("source Git metadata is required for exact-head validation")
        container_name = self._name_factory()
        uid = os.getuid()
        gid = os.getgid()
        if uid <= 0 or gid <= 0:
            raise RuntimeError("patch validation requires a non-root runner UID and GID")
        child_environment = {"PATH": os.environ.get("PATH", os.defpath)}

        with tempfile.TemporaryDirectory(prefix="noema-patch-validation-") as staging:
            staging_root = _validated_docker_mount_path(Path(staging), "staging root")
            source_mount = _materialize_committed_source(
                source,
                request.head_sha,
                staging_root,
                metadata_kind,
            )
            staged_patch = _write_private_patch_copy(staging_root, patch_bytes)
            git_metadata_mask = _create_git_metadata_mask(staging_root, metadata_kind)
            result_path = staging_root / "result.json"
            result_path.touch(mode=0o600)
            git_metadata_mount = (
                []
                if git_metadata_mask is None
                else [
                    "--mount=type=bind,"
                    f"src={git_metadata_mask},dst=/input/.git,readonly"
                ]
            )
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
                    f"{MAX_SOURCE_ARCHIVE_FILE_BYTES}:"
                    f"{MAX_SOURCE_ARCHIVE_FILE_BYTES}"
                ),
                f"--user={uid}:{gid}",
                (
                    "--tmpfs=/workspace:"
                    f"rw,nosuid,nodev,size=1073741824,mode=0700,uid={uid},gid={gid}"
                ),
                "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777",
                f"--mount=type=bind,src={source_mount},dst=/input,readonly",
                *git_metadata_mount,
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
                "--entrypoint=/opt/noema/bin/validate-patch",
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
                stderr = getattr(completed, "stderr", "") or ""
                stdout = getattr(completed, "stdout", "") or ""
                detail = _bounded_detail(stderr or stdout)
                raise RuntimeError(
                    f"patch validation sandbox exited {completed.returncode}: {detail}"
                )
            result_payload = _read_result_payload(
                result_path,
                completed,
                file_system=self._file_system,
            )
            try:
                result = PatchValidationResult.model_validate_json(result_payload)
            except (ValidationError, ValueError) as exc:
                raise RuntimeError(
                    "patch validation sandbox returned invalid structured evidence"
                ) from exc
            if not _result_matches_request(result, request):
                raise RuntimeError(
                    "patch validation sandbox result does not match the request"
                )
            return result
