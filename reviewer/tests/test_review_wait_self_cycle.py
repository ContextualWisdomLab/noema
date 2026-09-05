"""Regression contract for the central Noema review wait dependency graph."""

from pathlib import Path


def test_central_review_wait_excludes_its_own_noema_review_check() -> None:
    """Evidence collection must not wait on the Noema check that consumes its verdict."""
    repo_root = Path(__file__).resolve().parents[2]
    workflow = (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )
    wait_start = workflow.index("Wait for review-independent current-head checks")
    wait_end = workflow.index("      - name:", wait_start + 1)
    wait_step = workflow[wait_start:wait_end]

    assert '.name != "noema-review"' in wait_step
    assert '.name != "opencode-review"' in wait_step
    assert '.name != "metadata-only gate evaluation"' in wait_step
