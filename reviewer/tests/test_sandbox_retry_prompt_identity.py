"""Regression tests for CodeGraph sandbox retry-prompt identity."""

from __future__ import annotations

from noema_reviewer.sandbox import DockerCodeGraphRunner


def test_distinct_explore_prompt_executes_fresh_sandbox(monkeypatch, tmp_path) -> None:
    """A symbol-seeded retry must not receive the first explore prompt's cached output."""
    source = tmp_path / "source"
    source.mkdir()
    observed_prompts: list[str] = []

    def fake_sandbox(explore_prompt: str) -> str:
        observed_prompts.append(explore_prompt)
        return f"evidence:{explore_prompt}"

    runner = DockerCodeGraphRunner(name_factory=lambda: "unused")
    monkeypatch.setattr(runner, "_run_sandbox", fake_sandbox)

    first_prompt = "Review current-head changed files: src/app.ts"
    retry_prompt = (
        f"{first_prompt}\n\n"
        "Indexed changed-file symbol maps (retrieval seeds only):\n"
        "src/app.ts\n**Symbols**\nrun"
    )

    assert runner(["codegraph", "explore", first_prompt], str(source)) == f"evidence:{first_prompt}"
    assert runner(["codegraph", "explore", retry_prompt], str(source)) == f"evidence:{retry_prompt}"
    assert observed_prompts == [first_prompt, retry_prompt]

    # Repeating an identical prompt remains idempotently cached within one manifest.
    assert runner(["codegraph", "explore", first_prompt], str(source)) == f"evidence:{first_prompt}"
    assert observed_prompts == [first_prompt, retry_prompt]
