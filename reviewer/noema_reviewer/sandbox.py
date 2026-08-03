"""Docker-isolated CodeGraph execution for untrusted repository content.

The central evidence job still needs a read-only GitHub token for API evidence,
but CodeGraph receives no inherited credentials.  This runner buffers the
legacy four-command ``CodeGraphRunner`` protocol and executes the complete
analysis once, inside a fixed, resource-bounded container when ``explore`` is
requested.
"""

from __future__ import annotations

import os
import subprocess
import uuid
from collections.abc import Callable, Sequence
from pathlib import Path


PINNED_CODEGRAPH_SANDBOX_IMAGE = (
    "node:24.18.0-bookworm-slim@"
    "sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d"
)
SANDBOX_WALL_TIMEOUT_SECONDS = 600
MAX_FAILURE_DETAIL_CHARS = 1000
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CODEGRAPH_TOOLING_ROOT = REPOSITORY_ROOT / ".github" / "codegraph"
SANDBOX_ENTRYPOINT = CODEGRAPH_TOOLING_ROOT / "sandbox-runner.mjs"

ProcessRunner = Callable[..., subprocess.CompletedProcess[str]]
NameFactory = Callable[[], str]


def _bounded_detail(text: str) -> str:
    """Return a bounded single diagnostic suitable for fail-closed evidence."""
    compact = text.strip() or "no diagnostic output"
    if len(compact) <= MAX_FAILURE_DETAIL_CHARS:
        return compact
    omitted = len(compact) - MAX_FAILURE_DETAIL_CHARS
    return f"{compact[:MAX_FAILURE_DETAIL_CHARS]} [truncated {omitted} characters]"


def _validated_directory(raw_path: str | Path, label: str) -> Path:
    """Resolve a trusted bind-mount directory and reject ambiguous Docker paths."""
    try:
        resolved = Path(raw_path).resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable: {exc}") from exc
    if not resolved.is_dir():
        raise RuntimeError(f"{label} must be a directory: {resolved}")
    if any(character in str(resolved) for character in (",", "\n", "\r")):
        raise RuntimeError(f"{label} contains characters unsafe for a Docker mount: {resolved}")
    return resolved


def _validated_file(raw_path: str | Path, label: str) -> Path:
    """Resolve a trusted bind-mount file and reject missing or ambiguous paths."""
    try:
        resolved = Path(raw_path).resolve(strict=True)
    except OSError as exc:
        raise RuntimeError(f"{label} is unavailable: {exc}") from exc
    if not resolved.is_file():
        raise RuntimeError(f"{label} must be a regular file: {resolved}")
    if any(character in str(resolved) for character in (",", "\n", "\r")):
        raise RuntimeError(f"{label} contains characters unsafe for a Docker mount: {resolved}")
    return resolved


def _default_name() -> str:
    """Return an unpredictable Docker container name for concurrent reviews."""
    return f"noema-codegraph-{uuid.uuid4().hex}"


class DockerCodeGraphRunner:
    """Adapt CodeGraph's four-command protocol to one hardened Docker session."""

    _BUFFERED_COMMANDS = {
        ("codegraph", "init", "-i"),
        ("codegraph", "sync"),
        ("codegraph", "status"),
    }

    def __init__(
        self,
        *,
        command_runner: ProcessRunner = subprocess.run,
        cleanup_runner: ProcessRunner = subprocess.run,
        name_factory: NameFactory = _default_name,
    ) -> None:
        """Initialize injectable process runners and per-manifest session state."""
        self._command_runner = command_runner
        self._cleanup_runner = cleanup_runner
        self._name_factory = name_factory
        self._source_root: Path | None = None
        self._cached_output: str | None = None

    def __call__(self, args: Sequence[str], source_root: str) -> str:
        """Buffer setup calls and run the full sandbox when exploration begins."""
        command = tuple(args)
        root = Path(source_root).resolve()
        if self._source_root is None:
            self._source_root = root
        elif root != self._source_root:
            raise RuntimeError(
                "CodeGraph sandbox source root changed within one manifest: "
                f"expected={self._source_root} observed={root}"
            )

        if command in self._BUFFERED_COMMANDS:
            return ""
        if len(command) == 3 and command[:2] == ("codegraph", "explore"):
            if self._cached_output is None:
                self._cached_output = self._run_sandbox(command[2])
            return self._cached_output
        raise RuntimeError(f"unexpected CodeGraph command for sandbox: {list(args)}")

    def _run_sandbox(self, explore_prompt: str) -> str:
        """Launch the reviewed image with no network, secrets, or host write path."""
        configured_image = os.environ.get(
            "NOEMA_CODEGRAPH_SANDBOX_IMAGE",
            PINNED_CODEGRAPH_SANDBOX_IMAGE,
        )
        if configured_image != PINNED_CODEGRAPH_SANDBOX_IMAGE:
            raise RuntimeError(
                "NOEMA_CODEGRAPH_SANDBOX_IMAGE must equal the reviewed pinned digest"
            )

        source_root = _validated_directory(self._source_root or "", "source root")
        tooling_root = _validated_directory(CODEGRAPH_TOOLING_ROOT, "CodeGraph tooling")
        entrypoint = _validated_file(SANDBOX_ENTRYPOINT, "sandbox entrypoint")
        codegraph_binary = _validated_file(
            tooling_root / "node_modules" / ".bin" / "codegraph",
            "CodeGraph binary",
        )
        del codegraph_binary

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
            "--pids-limit=128",
            "--memory=1g",
            "--memory-swap=1g",
            "--cpus=2",
            "--ipc=none",
            "--ulimit=nofile=1024:1024",
            "--ulimit=nproc=128:128",
            "--ulimit=core=0:0",
            f"--user={uid}:{gid}",
            (
                "--tmpfs=/workspace:"
                f"rw,noexec,nosuid,nodev,size=805306368,mode=0700,uid={uid},gid={gid}"
            ),
            "--tmpfs=/tmp:rw,noexec,nosuid,nodev,size=67108864,mode=1777",
            f"--mount=type=bind,src={source_root},dst=/input,readonly",
            f"--mount=type=bind,src={tooling_root},dst=/tooling,readonly",
            f"--mount=type=bind,src={entrypoint},dst=/sandbox/sandbox-runner.mjs,readonly",
            "--workdir=/workspace",
            "--env=HOME=/workspace/home",
            "--env=XDG_CACHE_HOME=/workspace/cache",
            "--env=CODEGRAPH_NO_UPDATE_CHECK=1",
            "--env=DO_NOT_TRACK=1",
            "--env=NO_COLOR=1",
            PINNED_CODEGRAPH_SANDBOX_IMAGE,
            "node",
            "/sandbox/sandbox-runner.mjs",
            explore_prompt,
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
                timeout=SANDBOX_WALL_TIMEOUT_SECONDS,
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
                f"CodeGraph sandbox timed out after {SANDBOX_WALL_TIMEOUT_SECONDS} seconds"
            ) from exc
        except OSError as exc:
            raise RuntimeError(f"CodeGraph sandbox could not start Docker: {exc}") from exc

        if completed.returncode != 0:
            detail = _bounded_detail(completed.stderr or completed.stdout)
            raise RuntimeError(
                f"CodeGraph sandbox exited {completed.returncode}: {detail}"
            )
        return completed.stdout
