"""Contracts for the trusted central Noema review workflow."""

from pathlib import Path


def _workflow() -> str:
    """Return the trusted central-review workflow text."""
    repo_root = Path(__file__).resolve().parents[2]
    return (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )


def test_review_wait_excludes_only_exact_review_dependent_checks() -> None:
    """The independent reviewer must not wait on checks that consume its verdict."""
    workflow = _workflow()

    assert "Wait for review-independent current-head checks" in workflow
    assert '.name != "opencode-review"' in workflow
    assert '.name != "metadata-only gate evaluation"' in workflow
    assert "All review-independent current-head checks are complete." in workflow
    assert "non-OpenCode current-head checks" not in workflow


def test_review_wait_paginates_every_current_head_check_run() -> None:
    """The central waiter must inspect every check-run page, not only the first 100."""
    workflow = _workflow()

    assert "gh api --paginate --slurp" in workflow
    assert "check-runs?per_page=100" in workflow
    assert ".[].check_runs[]" in workflow


def test_production_review_requires_contextual_orchestrator_gateway() -> None:
    """The trusted workflow must not bypass the organization LLM gateway."""
    workflow = _workflow()

    assert "NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}" in workflow
    assert "NOEMA_LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}" not in workflow
    assert "NOEMA_FALLBACK_LLM_API_URL:" not in workflow
    assert "NOEMA_FALLBACK_LLM_API_KEY:" not in workflow
    assert '"service") != "contextual-orchestrator"' in workflow
    assert "Noema production review must use contextual-orchestrator" in workflow
    assert "Verified contextual-orchestrator gateway identity." in workflow


def test_untrusted_codegraph_analysis_uses_the_pinned_quarantine_runner() -> None:
    """Target parsing must occur in the reviewed no-network Docker sandbox."""
    workflow = _workflow()
    image = (
        "node:24.18.0-bookworm-slim@"
        "sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d"
    )

    assert f"NOEMA_CODEGRAPH_SANDBOX_IMAGE: {image}" in workflow
    pull_index = workflow.index("Pull reviewed CodeGraph sandbox image without credentials")
    collect_index = workflow.index("Collect bounded current-head review manifest")
    assert pull_index < collect_index
    assert 'docker pull "$NOEMA_CODEGRAPH_SANDBOX_IMAGE"' in workflow
    assert "from noema_reviewer.sandbox import DockerCodeGraphRunner" in workflow
    assert "codegraph_runner=DockerCodeGraphRunner()" in workflow
    assert "source_root=source_root" in workflow
    assert "NOEMA_LLM_API_KEY" not in workflow[pull_index:collect_index]
