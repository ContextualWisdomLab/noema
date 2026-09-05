"""Production-path regression for semantic CodeGraph retry recovery."""

from __future__ import annotations

from pathlib import Path

from noema_reviewer.sandbox import DockerCodeGraphRunner


def _session_output(explore_output: str) -> str:
    """Build the trusted sandbox envelope around one explore stdout payload."""
    return (
        "Sandbox copied 1 files (41 bytes).\n\n"
        "## codegraph init\ninitialized\n\n"
        "## codegraph sync\nsynced\n\n"
        "## codegraph status\nIndex is up to date\n\n"
        f"## codegraph explore\n{explore_output}"
    )


def test_central_docker_runner_symbol_seeds_retry_without_host_fallback(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """Central review must keep symbol recovery and retry inside its Docker runner."""
    source = tmp_path / "source"
    changed = source / "src" / "readiness.ts"
    changed.parent.mkdir(parents=True)
    changed.write_text("export const commercialReadiness = true;\n", encoding="utf-8")
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")
    observed: list[tuple[str, str]] = []

    def fake_explore(prompt: str) -> str:
        observed.append(("explore", prompt))
        if "Indexed changed-file symbol maps" in prompt:
            return _session_output("commercialReadiness -> publishReadiness")
        return _session_output('No relevant code found for "path-only query"')

    def fake_node(path: str) -> str:
        observed.append(("node", path))
        return "**Symbols**\n- commercialReadiness"

    monkeypatch.setattr(runner, "_run_sandbox", fake_explore)
    monkeypatch.setattr(runner, "_run_node_sandbox", fake_node)
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: src/readiness.ts"
    )

    result = runner(["codegraph", "explore", query], str(source))

    assert result == (
        "Sandbox copied 1 files (41 bytes).\n"
        "## codegraph explore\ncommercialReadiness -> publishReadiness"
    )
    assert [kind for kind, _ in observed] == ["explore", "node", "explore"]
    assert observed[1] == ("node", "src/readiness.ts")


def test_central_review_uses_semantic_docker_runner_directly() -> None:
    """The hosted collector must use the Docker runner that owns semantic recovery."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github" / "workflows" / "central-review.yml").read_text(
        encoding="utf-8"
    )
    sandbox_source = (
        repo_root / "reviewer" / "noema_reviewer" / "sandbox.py"
    ).read_text(encoding="utf-8")

    assert "codegraph_runner=DockerCodeGraphRunner()" in workflow
    assert "build_semantic_codegraph_runner(self._run_raw_command)" in sandbox_source
    assert "self._run_node_sandbox(path)" in sandbox_source
