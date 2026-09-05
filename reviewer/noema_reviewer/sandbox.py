"""Docker-isolated CodeGraph execution for untrusted repository content.

The central evidence job still needs a read-only GitHub token for API evidence,
but CodeGraph receives no inherited credentials. This runner keeps both semantic
exploration and bounded symbol recovery inside verified, resource-bounded
containers and exposes only wrapper-owned semantic provenance to the reviewer.
"""

from __future__ import annotations

import os
import re
import subprocess
import uuid
from collections.abc import Callable, Sequence
from pathlib import Path


TRUSTED_CODEGRAPH_IMAGE_REPOSITORY = "gcr.io/distroless/java-base-debian13"
TRUSTED_CODEGRAPH_IMAGE_RE = re.compile(
    rf"^{re.escape(TRUSTED_CODEGRAPH_IMAGE_REPOSITORY)}@sha256:[0-9a-f]{{64}}$"
)
SANDBOX_WALL_TIMEOUT_SECONDS = 600
MAX_FAILURE_DETAIL_CHARS = 1000
REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
CODEGRAPH_TOOLING_ROOT = REPOSITORY_ROOT / ".github" / "codegraph"
SANDBOX_ENTRYPOINT = CODEGRAPH_TOOLING_ROOT / "sandbox-runner.mjs"
SANDBOX_NODE_ENTRYPOINT = CODEGRAPH_TOOLING_ROOT / "sandbox-node-runner.mjs"
CODEGRAPH_PLATFORM_PACKAGE = (
    CODEGRAPH_TOOLING_ROOT
    / "node_modules"
    / "@colbymchenry"
    / "codegraph-linux-x64"
)
BUNDLED_CODEGRAPH_NODE = "/tooling/node_modules/@colbymchenry/codegraph-linux-x64/node"
SANDBOX_EXPLORE_MARKER = "## codegraph explore"
SANDBOX_COPY_SUMMARY_RE = re.compile(r"^Sandbox copied [0-9]+ files \([0-9]+ bytes\)\.$")

ProcessRunner = Callable[..., subprocess.CompletedProcess[str]]
NameFactory = Callable[[], str]
CodeGraphRunner = Callable[[Sequence[str], str], str]


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


def _verified_image_reference() -> str:
    """Return the workflow-verified immutable distroless image reference."""
    image = os.environ.get("NOEMA_CODEGRAPH_SANDBOX_IMAGE", "").strip()
    if not TRUSTED_CODEGRAPH_IMAGE_RE.fullmatch(image):
        raise RuntimeError(
            "NOEMA_CODEGRAPH_SANDBOX_IMAGE must be a verified immutable "
            f"{TRUSTED_CODEGRAPH_IMAGE_REPOSITORY}@sha256 reference"
        )
    return image


def _extract_explore_output(session_output: str) -> tuple[str, str]:
    """Extract one trusted sandbox copy summary and the sole explore stdout section."""
    lines = session_output.splitlines()
    if not lines or not SANDBOX_COPY_SUMMARY_RE.fullmatch(lines[0].strip()):
        raise RuntimeError("CodeGraph sandbox omitted its trusted copy summary")
    marker_indexes = [
        index
        for index, line in enumerate(lines)
        if line.strip().lower() == SANDBOX_EXPLORE_MARKER
    ]
    if len(marker_indexes) != 1:
        raise RuntimeError(
            "CodeGraph sandbox explore output has ambiguous provenance: "
            f"markers={len(marker_indexes)}"
        )
    marker_index = marker_indexes[0]
    return lines[0].strip(), "\n".join(lines[marker_index + 1 :]).strip()


class DockerCodeGraphRunner:
    """Adapt CodeGraph collection to one semantic, no-network execution boundary."""

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
        self._raw_explore_outputs: dict[str, str] = {}
        self._raw_node_outputs: dict[str, str] = {}
        self._copy_summaries: dict[str, str] = {}
        self._semantic_runner: CodeGraphRunner | None = None

    def _bind_source_root(self, source_root: str) -> None:
        """Bind one runner instance to a single physical repository selection."""
        root = Path(source_root).resolve()
        if self._source_root is None:
            self._source_root = root
        elif root != self._source_root:
            raise RuntimeError(
                "CodeGraph sandbox source root changed within one manifest: "
                f"expected={self._source_root} observed={root}"
            )

    def __call__(self, args: Sequence[str], source_root: str) -> str:
        """Return semantic explore evidence while buffering legacy setup commands."""
        self._bind_source_root(source_root)
        command = tuple(args)
        if command in self._BUFFERED_COMMANDS:
            return ""
        if len(command) != 3 or command[:2] != ("codegraph", "explore"):
            raise RuntimeError(f"unexpected CodeGraph command for sandbox: {list(args)}")

        if self._semantic_runner is None:
            # Imported lazily to keep the sandbox execution boundary independent
            # from the CLI module at import time while reusing its exact semantic
            # evidence and retry contract.
            from .cli import build_semantic_codegraph_runner

            self._semantic_runner = build_semantic_codegraph_runner(self._run_raw_command)
        semantic_output = self._semantic_runner(args, source_root)
        summary = self._copy_summaries.get(command[2], "")
        return f"{summary}\n{semantic_output}" if summary else semantic_output

    def _run_raw_command(self, args: Sequence[str], source_root: str) -> str:
        """Run only the raw explore/node commands needed by semantic recovery."""
        self._bind_source_root(source_root)
        command = tuple(args)
        if len(command) == 3 and command[:2] == ("codegraph", "explore"):
            prompt = command[2]
            if prompt not in self._raw_explore_outputs:
                summary, output = _extract_explore_output(self._run_sandbox(prompt))
                self._copy_summaries[prompt] = summary
                self._raw_explore_outputs[prompt] = output
            return self._raw_explore_outputs[prompt]
        if (
            len(command) == 5
            and command[:2] == ("codegraph", "node")
            and command[2] == "--file"
            and command[4] == "--symbols-only"
        ):
            path = command[3]
            if path not in self._raw_node_outputs:
                self._raw_node_outputs[path] = self._run_node_sandbox(path)
            return self._raw_node_outputs[path]
        raise RuntimeError(f"unexpected raw CodeGraph command for sandbox: {list(args)}")

    def _sandbox_command(
        self,
        *,
        container_name: str,
        image: str,
        source_root: Path,
        tooling_root: Path,
        entrypoint: Path,
        container_entrypoint: str,
        payload: Sequence[str],
    ) -> list[str]:
        """Build the shared hardened Docker command for one bounded CodeGraph operation."""
        uid = os.getuid()
        gid = os.getgid()
        return [
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
            f"--mount=type=bind,src={entrypoint},dst={container_entrypoint},readonly",
            "--workdir=/workspace",
            "--env=HOME=/workspace/home",
            "--env=XDG_CACHE_HOME=/workspace/cache",
            "--env=CODEGRAPH_NO_UPDATE_CHECK=1",
            "--env=DO_NOT_TRACK=1",
            "--env=NO_COLOR=1",
            image,
            BUNDLED_CODEGRAPH_NODE,
            container_entrypoint,
            *payload,
        ]

    def _execute_container(self, command: list[str], container_name: str) -> str:
        """Execute one hardened Docker command and bound cleanup/error evidence."""
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

    def _validated_sandbox_inputs(self) -> tuple[str, Path, Path]:
        """Validate the immutable image, source mount, and bundled CodeGraph tooling."""
        image = _verified_image_reference()
        source_root = _validated_directory(self._source_root or "", "source root")
        tooling_root = _validated_directory(CODEGRAPH_TOOLING_ROOT, "CodeGraph tooling")
        platform_package = _validated_directory(
            CODEGRAPH_PLATFORM_PACKAGE,
            "CodeGraph Linux platform package",
        )
        _validated_file(platform_package / "node", "CodeGraph bundled Node")
        _validated_file(
            platform_package / "lib" / "dist" / "bin" / "codegraph.js",
            "CodeGraph bundled entrypoint",
        )
        return image, source_root, tooling_root

    def _run_sandbox(self, explore_prompt: str) -> str:
        """Launch the verified image for one semantic explore operation."""
        image, source_root, tooling_root = self._validated_sandbox_inputs()
        entrypoint = _validated_file(SANDBOX_ENTRYPOINT, "sandbox entrypoint")
        container_name = self._name_factory()
        command = self._sandbox_command(
            container_name=container_name,
            image=image,
            source_root=source_root,
            tooling_root=tooling_root,
            entrypoint=entrypoint,
            container_entrypoint="/sandbox/sandbox-runner.mjs",
            payload=[explore_prompt],
        )
        return self._execute_container(command, container_name)

    def _run_node_sandbox(self, relative_path: str) -> str:
        """Probe one exact changed-file symbol map inside the same hardened boundary."""
        image, source_root, tooling_root = self._validated_sandbox_inputs()
        entrypoint = _validated_file(SANDBOX_NODE_ENTRYPOINT, "sandbox node entrypoint")
        container_name = self._name_factory()
        command = self._sandbox_command(
            container_name=container_name,
            image=image,
            source_root=source_root,
            tooling_root=tooling_root,
            entrypoint=entrypoint,
            container_entrypoint="/sandbox/sandbox-node-runner.mjs",
            payload=[relative_path],
        )
        return self._execute_container(command, container_name)
