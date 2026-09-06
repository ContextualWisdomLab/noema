"""Branch-complete contracts for semantic Docker CodeGraph recovery."""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from noema_reviewer import sandbox
from noema_reviewer.sandbox import DockerCodeGraphRunner, _extract_explore_output


TEST_IMAGE = f"{sandbox.TRUSTED_CODEGRAPH_IMAGE_REPOSITORY}@sha256:{'b' * 64}"


def _session(evidence: str) -> str:
    """Build one valid trusted explore session envelope."""
    return (
        "Sandbox copied 1 files (41 bytes).\n\n"
        "## codegraph init\ninitialized\n\n"
        "## codegraph sync\nsynced\n\n"
        "## codegraph status\nIndex is up to date\n\n"
        f"## codegraph explore\n{evidence}"
    )


def _sandbox_paths(tmp_path, monkeypatch) -> None:
    """Install minimal reviewed tooling paths for command-construction tests."""
    tooling = tmp_path / "tooling"
    platform = tooling / "node_modules" / "@colbymchenry" / "codegraph-linux-x64"
    node = platform / "node"
    node.parent.mkdir(parents=True)
    node.write_text("trusted node", encoding="utf-8")
    entry = platform / "lib" / "dist" / "bin" / "codegraph.js"
    entry.parent.mkdir(parents=True)
    entry.write_text("export {};", encoding="utf-8")
    explore = tooling / "sandbox-runner.mjs"
    explore.write_text("export {};", encoding="utf-8")
    symbol = tooling / "sandbox-node-runner.mjs"
    symbol.write_text("export {};", encoding="utf-8")
    monkeypatch.setattr(sandbox, "CODEGRAPH_TOOLING_ROOT", tooling)
    monkeypatch.setattr(sandbox, "CODEGRAPH_PLATFORM_PACKAGE", platform)
    monkeypatch.setattr(sandbox, "SANDBOX_ENTRYPOINT", explore)
    monkeypatch.setattr(sandbox, "SANDBOX_NODE_ENTRYPOINT", symbol)
    monkeypatch.setenv("NOEMA_CODEGRAPH_SANDBOX_IMAGE", TEST_IMAGE)


def test_extract_explore_output_rejects_missing_or_ambiguous_trusted_envelope() -> None:
    """A malformed container envelope cannot be promoted to semantic evidence."""
    with pytest.raises(RuntimeError, match="copy summary"):
        _extract_explore_output("")
    with pytest.raises(RuntimeError, match="copy summary"):
        _extract_explore_output("unstructured semantic bytes")
    with pytest.raises(RuntimeError, match="markers=0"):
        _extract_explore_output("Sandbox copied 1 files (1 bytes).\nno marker")
    with pytest.raises(RuntimeError, match="markers=2"):
        _extract_explore_output(
            "Sandbox copied 1 files (1 bytes).\n"
            "## codegraph explore\nfirst\n## codegraph explore\nsecond"
        )


def test_real_docker_adapter_routes_symbol_probe_and_retry_through_no_network_boundary(
    monkeypatch,
    tmp_path,
) -> None:
    """The production adapter executes explore/node/retry as isolated container commands."""
    source = tmp_path / "source"
    changed = source / "src" / "readiness.ts"
    changed.parent.mkdir(parents=True)
    changed.write_text("export const commercialReadiness = true;\n", encoding="utf-8")
    _sandbox_paths(tmp_path, monkeypatch)
    calls: list[list[str]] = []

    def fake_run(args, **_kwargs):
        command = list(args)
        calls.append(command)
        if "/sandbox/sandbox-node-runner.mjs" in command:
            return SimpleNamespace(
                returncode=0,
                stdout="**Symbols**\n- commercialReadiness",
                stderr="",
            )
        prompt = command[-1]
        if "Indexed changed-file symbol maps" in prompt:
            output = _session("commercialReadiness -> publishReadiness")
        else:
            output = _session('No relevant code found for "path-only query"')
        return SimpleNamespace(returncode=0, stdout=output, stderr="")

    runner = DockerCodeGraphRunner(
        command_runner=fake_run,
        cleanup_runner=fake_run,
        name_factory=lambda: f"semantic-{len(calls)}",
    )
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: src/readiness.ts"
    )

    result = runner(["codegraph", "explore", query], str(source))

    assert result == (
        "Sandbox copied 1 files (41 bytes).\n"
        "## codegraph explore\ncommercialReadiness -> publishReadiness"
    )
    assert len(calls) == 3
    assert "/sandbox/sandbox-runner.mjs" in calls[0]
    assert "/sandbox/sandbox-node-runner.mjs" in calls[1]
    assert calls[1][-1] == "src/readiness.ts"
    assert "/sandbox/sandbox-runner.mjs" in calls[2]
    for command in calls:
        assert "--network=none" in command
        assert "--read-only" in command
        assert "--cap-drop=ALL" in command
        assert not any("docker.sock" in part for part in command)

    raw_node = ["codegraph", "node", "--file", "src/readiness.ts", "--symbols-only"]
    assert runner._run_raw_command(raw_node, str(source)).startswith("**Symbols**")
    assert runner._run_raw_command(raw_node, str(source)).startswith("**Symbols**")
    assert len(calls) == 3

    with pytest.raises(RuntimeError, match="unexpected raw CodeGraph command"):
        runner._run_raw_command(["codegraph", "node", "src/readiness.ts"], str(source))
