"""Production-path regression for semantic CodeGraph retry recovery."""

from __future__ import annotations

from pathlib import Path

from noema_reviewer.cli import build_semantic_codegraph_runner
from noema_reviewer.sandbox import DockerCodeGraphRunner


def test_semantic_retry_uses_injected_sandbox_for_node_and_second_explore(
    monkeypatch,
    tmp_path: Path,
) -> None:
    """Central review must keep symbol recovery inside the injected Docker runner."""
    source = tmp_path / "source"
    changed = source / "src" / "readiness.ts"
    changed.parent.mkdir(parents=True)
    changed.write_text("export const commercialReadiness = true;\n", encoding="utf-8")
    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")
    observed: list[tuple[str, str]] = []

    def fake_explore(prompt: str) -> str:
        observed.append(("explore", prompt))
        if "Indexed changed-file symbol maps" in prompt:
            return "commercialReadiness -> publishReadiness"
        return 'No relevant code found for "path-only query"'

    def fake_node(path: str) -> str:
        observed.append(("node", path))
        return "**Symbols**\n- commercialReadiness"

    monkeypatch.setattr(runner, "_run_sandbox", fake_explore)
    monkeypatch.setattr(runner, "_run_node_sandbox", fake_node)
    semantic_runner = build_semantic_codegraph_runner(runner)
    query = (
        "Review blast radius, call paths, security boundaries, and focused tests "
        "for these current-head changed files: src/readiness.ts"
    )

    result = semantic_runner(["codegraph", "explore", query], str(source))

    assert result == "## codegraph explore\ncommercialReadiness -> publishReadiness"
    assert [kind for kind, _ in observed] == ["explore", "node", "explore"]
    assert observed[1] == ("node", "src/readiness.ts")


def test_central_review_composes_semantic_wrapper_around_docker_runner() -> None:
    """The hosted manifest collector must not bypass semantic retry composition."""
    workflow = (
        Path(__file__).resolve().parents[2] / ".github" / "workflows" / "central-review.yml"
    ).read_text(encoding="utf-8")

    assert "from noema_reviewer.cli import build_semantic_codegraph_runner" in workflow
    assert (
        "codegraph_runner=build_semantic_codegraph_runner(DockerCodeGraphRunner())"
        in workflow
    )
