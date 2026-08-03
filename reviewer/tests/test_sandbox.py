"""Tests for the Docker-isolated CodeGraph execution boundary."""

from __future__ import annotations

import os
import subprocess
from types import SimpleNamespace

import pytest

from noema_reviewer import sandbox
from noema_reviewer.sandbox import DockerCodeGraphRunner


def _sandbox_paths(tmp_path, monkeypatch):
    """Create trusted tooling and entrypoint paths and bind them to the module."""
    tooling = tmp_path / "tooling"
    binary = tooling / "node_modules" / ".bin" / "codegraph"
    binary.parent.mkdir(parents=True)
    binary.write_text("trusted", encoding="utf-8")
    entrypoint = tooling / "sandbox-runner.mjs"
    entrypoint.write_text("export {};", encoding="utf-8")
    monkeypatch.setattr(sandbox, "CODEGRAPH_TOOLING_ROOT", tooling)
    monkeypatch.setattr(sandbox, "SANDBOX_ENTRYPOINT", entrypoint)
    return tooling, entrypoint


def test_runner_buffers_protocol_and_launches_one_hardened_container(tmp_path, monkeypatch) -> None:
    """The four-command interface becomes one secret-free sandbox session."""
    source = tmp_path / "source"
    source.mkdir()
    tooling, entrypoint = _sandbox_paths(tmp_path, monkeypatch)
    calls: list[tuple[list[str], dict[str, object]]] = []

    def fake_run(args, **kwargs):
        """Capture the Docker command and return bounded sandbox output."""
        calls.append((list(args), kwargs))
        return SimpleNamespace(returncode=0, stdout="sandbox evidence", stderr="")

    monkeypatch.setenv("GH_TOKEN", "github-secret")
    monkeypatch.setenv("NOEMA_LLM_API_KEY", "model-secret")
    monkeypatch.setenv("PATH", "/trusted/bin")
    runner = DockerCodeGraphRunner(
        command_runner=fake_run,
        cleanup_runner=fake_run,
        name_factory=lambda: "fixed-container",
    )

    assert runner(["codegraph", "init", "-i"], str(source)) == ""
    assert runner(["codegraph", "sync"], str(source)) == ""
    assert runner(["codegraph", "status"], str(source)) == ""
    prompt = "Review current-head changed files: src/app.ts"
    assert runner(["codegraph", "explore", prompt], str(source)) == "sandbox evidence"
    assert runner(["codegraph", "explore", prompt], str(source)) == "sandbox evidence"
    assert len(calls) == 1

    command, kwargs = calls[0]
    assert command[:3] == ["docker", "run", "--rm"]
    for required in (
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
    ):
        assert required in command
    assert f"type=bind,src={source.resolve()},dst=/input,readonly" in command
    assert f"type=bind,src={tooling.resolve()},dst=/tooling,readonly" in command
    assert f"type=bind,src={entrypoint.resolve()},dst=/sandbox/sandbox-runner.mjs,readonly" in command
    assert not any("docker.sock" in part for part in command)
    assert command[-4:] == [
        sandbox.PINNED_CODEGRAPH_SANDBOX_IMAGE,
        "node",
        "/sandbox/sandbox-runner.mjs",
        prompt,
    ]
    assert kwargs["shell"] is False
    assert kwargs["timeout"] == sandbox.SANDBOX_WALL_TIMEOUT_SECONDS
    assert kwargs["env"] == {"PATH": "/trusted/bin"}
    assert "github-secret" not in repr((command, kwargs))
    assert "model-secret" not in repr((command, kwargs))


def test_runner_rejects_unexpected_protocol_command(tmp_path, monkeypatch) -> None:
    """Only the fixed CodeGraph init/sync/status/explore protocol is accepted."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="unexpected CodeGraph command"):
        runner(["codegraph", "query", "secret"], str(source))


def test_runner_rejects_source_root_change(tmp_path, monkeypatch) -> None:
    """One runner instance cannot be redirected to a second repository root."""
    first = tmp_path / "first"
    second = tmp_path / "second"
    first.mkdir()
    second.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    assert runner(["codegraph", "init", "-i"], str(first)) == ""
    with pytest.raises(RuntimeError, match="source root changed"):
        runner(["codegraph", "sync"], str(second))


def test_runner_rejects_unpinned_image_override(tmp_path, monkeypatch) -> None:
    """Runtime configuration cannot replace the reviewed image digest."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)
    monkeypatch.setenv("NOEMA_CODEGRAPH_SANDBOX_IMAGE", "node:latest")
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="must equal the reviewed pinned digest"):
        runner(["codegraph", "explore", "scope"], str(source))


@pytest.mark.parametrize("kind", ["missing", "file", "unsafe"])
def test_runner_rejects_invalid_source_root(tmp_path, monkeypatch, kind: str) -> None:
    """Missing, non-directory, and Docker-ambiguous source paths fail closed."""
    _sandbox_paths(tmp_path, monkeypatch)
    if kind == "missing":
        source = tmp_path / "missing"
    elif kind == "file":
        source = tmp_path / "source-file"
        source.write_text("x", encoding="utf-8")
    else:
        source = tmp_path / "unsafe,path"
        source.mkdir()
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="source root"):
        runner(["codegraph", "explore", "scope"], str(source))


def test_runner_rejects_missing_trusted_tooling(tmp_path, monkeypatch) -> None:
    """The sandbox cannot start without the reviewed CodeGraph installation."""
    source = tmp_path / "source"
    source.mkdir()
    tooling = tmp_path / "missing-tooling"
    entrypoint = tmp_path / "missing-entrypoint.mjs"
    monkeypatch.setattr(sandbox, "CODEGRAPH_TOOLING_ROOT", tooling)
    monkeypatch.setattr(sandbox, "SANDBOX_ENTRYPOINT", entrypoint)
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="CodeGraph tooling"):
        runner(["codegraph", "explore", "scope"], str(source))


def test_runner_rejects_missing_trusted_entrypoint(tmp_path, monkeypatch) -> None:
    """The reviewed in-container entrypoint must exist as a regular file."""
    source = tmp_path / "source"
    source.mkdir()
    tooling, _ = _sandbox_paths(tmp_path, monkeypatch)
    missing = tooling / "missing.mjs"
    monkeypatch.setattr(sandbox, "SANDBOX_ENTRYPOINT", missing)
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")

    with pytest.raises(RuntimeError, match="sandbox entrypoint"):
        runner(["codegraph", "explore", "scope"], str(source))


def test_runner_cleans_up_timed_out_container(tmp_path, monkeypatch) -> None:
    """A host wall-clock timeout force-removes the named sandbox container."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)
    cleanup_calls: list[list[str]] = []

    def timed_out(args, **kwargs):
        """Simulate a Docker client exceeding the wall-clock budget."""
        raise subprocess.TimeoutExpired(args, kwargs["timeout"])

    def cleanup(args, **kwargs):
        """Record forced cleanup after timeout."""
        cleanup_calls.append(list(args))
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    runner = DockerCodeGraphRunner(
        command_runner=timed_out,
        cleanup_runner=cleanup,
        name_factory=lambda: "timed-out-container",
    )

    with pytest.raises(RuntimeError, match="timed out after 600 seconds"):
        runner(["codegraph", "explore", "scope"], str(source))
    assert cleanup_calls == [["docker", "rm", "-f", "timed-out-container"]]


def test_runner_wraps_missing_docker_runtime(tmp_path, monkeypatch) -> None:
    """A missing Docker client becomes a visible CodeGraph evidence failure."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)

    def missing_docker(_args, **_kwargs):
        """Simulate a missing Docker executable."""
        raise FileNotFoundError("docker not installed")

    runner = DockerCodeGraphRunner(
        command_runner=missing_docker,
        name_factory=lambda: "missing-docker",
    )
    with pytest.raises(RuntimeError, match="could not start Docker"):
        runner(["codegraph", "explore", "scope"], str(source))


def test_runner_bounds_failed_container_diagnostics(tmp_path, monkeypatch) -> None:
    """Container failures expose a bounded reason without flooding the manifest."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)

    def failed(_args, **_kwargs):
        """Return a long attacker-controlled diagnostic."""
        return SimpleNamespace(returncode=17, stdout="", stderr="x" * 5000)

    runner = DockerCodeGraphRunner(
        command_runner=failed,
        name_factory=lambda: "failed-container",
    )
    with pytest.raises(RuntimeError) as captured:
        runner(["codegraph", "explore", "scope"], str(source))
    message = str(captured.value)
    assert "exited 17" in message
    assert "truncated" in message
    assert len(message) < 1400


def test_runner_reports_empty_failure_output(tmp_path, monkeypatch) -> None:
    """A silent non-zero exit still produces an actionable failure reason."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)

    def silent_failure(_args, **_kwargs):
        """Return no process diagnostics."""
        return SimpleNamespace(returncode=1, stdout="", stderr="")

    runner = DockerCodeGraphRunner(
        command_runner=silent_failure,
        name_factory=lambda: "silent-container",
    )
    with pytest.raises(RuntimeError, match="no diagnostic output"):
        runner(["codegraph", "explore", "scope"], str(source))


def test_runner_uses_default_path_when_parent_path_is_absent(tmp_path, monkeypatch) -> None:
    """The Docker client gets a deterministic empty PATH rather than credentials."""
    source = tmp_path / "source"
    source.mkdir()
    _sandbox_paths(tmp_path, monkeypatch)
    observed: dict[str, object] = {}

    def successful(_args, **kwargs):
        """Capture the environment used when PATH is absent."""
        observed.update(kwargs)
        return SimpleNamespace(returncode=0, stdout="ok", stderr="")

    monkeypatch.delenv("PATH", raising=False)
    runner = DockerCodeGraphRunner(
        command_runner=successful,
        name_factory=lambda: "empty-path",
    )
    assert runner(["codegraph", "explore", "scope"], str(source)) == "ok"
    assert observed["env"] == {"PATH": os.defpath}
