"""Regression tests for CodeGraph sandbox retry-prompt identity."""

from __future__ import annotations

from noema_reviewer.sandbox import DockerCodeGraphRunner


def _session(prompt: str) -> str:
    """Wrap one prompt-specific semantic payload in the trusted sandbox envelope."""
    return (
        "Sandbox copied 1 files (1 bytes).\n\n"
        "## codegraph init\ninitialized\n\n"
        "## codegraph sync\nsynced\n\n"
        "## codegraph status\nIndex is up to date\n\n"
        f"## codegraph explore\nevidence:{prompt}"
    )


def test_distinct_explore_prompt_executes_fresh_sandbox(monkeypatch, tmp_path) -> None:
    """A distinct explore prompt must not receive another prompt's cached raw output."""
    source = tmp_path / "source"
    source.mkdir()
    observed_prompts: list[str] = []

    def fake_sandbox(explore_prompt: str) -> str:
        observed_prompts.append(explore_prompt)
        return _session(explore_prompt)

    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")
    monkeypatch.setattr(runner, "_run_sandbox", fake_sandbox)

    first_prompt = "Review current-head changed files: src/app.ts"
    retry_prompt = (
        f"{first_prompt}\n\n"
        "Indexed changed-file symbol maps (retrieval seeds only):\n"
        "src/app.ts\n**Symbols**\nrun"
    )

    assert runner(["codegraph", "explore", first_prompt], str(source)) == (
        "Sandbox copied 1 files (1 bytes).\n"
        f"## codegraph explore\nevidence:{first_prompt}"
    )
    assert runner(["codegraph", "explore", retry_prompt], str(source)) == (
        "Sandbox copied 1 files (1 bytes).\n"
        f"## codegraph explore\nevidence:{retry_prompt}"
    )
    assert observed_prompts == [first_prompt, retry_prompt]

    # Repeating an identical prompt remains idempotently cached within one manifest.
    assert runner(["codegraph", "explore", first_prompt], str(source)).endswith(
        f"evidence:{first_prompt}"
    )
    assert observed_prompts == [first_prompt, retry_prompt]
