"""Contracts for the trusted central Noema review workflow."""

from pathlib import Path


def test_review_wait_excludes_only_exact_review_dependent_checks() -> None:
    """The independent reviewer must not wait on checks that consume its verdict."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )

    assert "Wait for review-independent current-head checks" in workflow
    assert '.name != "opencode-review"' in workflow
    assert '.name != "metadata-only gate evaluation"' in workflow
    assert "All review-independent current-head checks are complete." in workflow
    assert "non-OpenCode current-head checks" not in workflow


def test_review_wait_paginates_every_current_head_check_run() -> None:
    """The central waiter must inspect every check-run page, not only the first 100."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )

    assert "gh api --paginate --slurp" in workflow
    assert "check-runs?per_page=100" in workflow
    assert ".[].check_runs[]" in workflow


def test_review_wait_includes_latest_commit_status_contexts() -> None:
    """The central waiter must include every newest legacy status context."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )

    assert "statuses?per_page=100" in workflow
    assert "reduce $statuses[] as $status" in workflow
    assert '.state == "pending"' in workflow
    assert '.context != "opencode-review"' not in workflow
    assert '.context != "metadata-only gate evaluation"' not in workflow
    assert '$checks + $statuses | unique | join(", ")' in workflow


def test_production_review_requires_contextual_orchestrator_gateway() -> None:
    """The trusted workflow must not bypass the organization LLM gateway."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )

    assert "NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}" in workflow
    assert "NOEMA_LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}" not in workflow
    assert "NOEMA_FALLBACK_LLM_API_URL:" not in workflow
    assert "NOEMA_FALLBACK_LLM_API_KEY:" not in workflow
    assert '"service") != "contextual-orchestrator"' in workflow
    assert "Noema production review must use contextual-orchestrator" in workflow
    assert "Verified contextual-orchestrator gateway identity." in workflow
