"""Regression for semantic provenance in the production CodeGraph sandbox runner."""

from types import SimpleNamespace

from noema_reviewer import sandbox
from noema_reviewer.sandbox import DockerCodeGraphRunner


TEST_IMAGE = f"{sandbox.TRUSTED_CODEGRAPH_IMAGE_REPOSITORY}@sha256:{'a' * 64}"


def test_docker_runner_labels_explore_stdout_as_semantic_evidence(tmp_path, monkeypatch) -> None:
    """The central-review sandbox must identify which stdout came from explore."""
    source = tmp_path / "source"
    source.mkdir()
    tooling = tmp_path / "tooling"
    platform = tooling / "node_modules" / "@colbymchenry" / "codegraph-linux-x64"
    bundled_node = platform / "node"
    bundled_node.parent.mkdir(parents=True)
    bundled_node.write_text("trusted node", encoding="utf-8")
    bundled_entrypoint = platform / "lib" / "dist" / "bin" / "codegraph.js"
    bundled_entrypoint.parent.mkdir(parents=True)
    bundled_entrypoint.write_text("export {};", encoding="utf-8")
    entrypoint = tooling / "sandbox-runner.mjs"
    entrypoint.write_text("export {};", encoding="utf-8")

    monkeypatch.setattr(sandbox, "CODEGRAPH_TOOLING_ROOT", tooling)
    monkeypatch.setattr(sandbox, "CODEGRAPH_PLATFORM_PACKAGE", platform)
    monkeypatch.setattr(sandbox, "SANDBOX_ENTRYPOINT", entrypoint)
    monkeypatch.setenv("NOEMA_CODEGRAPH_SANDBOX_IMAGE", TEST_IMAGE)

    def fake_run(_args, **_kwargs):
        return SimpleNamespace(
            returncode=0,
            stdout="src/runtime.ts -> executeTask -> capability boundary",
            stderr="",
        )

    runner = DockerCodeGraphRunner(
        command_runner=fake_run,
        cleanup_runner=fake_run,
        name_factory=lambda: "semantic-provenance",
    )

    assert runner(
        ["codegraph", "explore", "review src/runtime.ts"],
        str(source),
    ) == (
        "## codegraph explore\n"
        "src/runtime.ts -> executeTask -> capability boundary"
    )
