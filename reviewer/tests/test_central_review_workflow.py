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
