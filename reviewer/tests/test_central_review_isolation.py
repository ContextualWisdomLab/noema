"""Security contracts for isolating untrusted review evidence from publication secrets."""

from pathlib import Path


WORKFLOW_PATH = Path(__file__).resolve().parents[2] / ".github/workflows/central-review.yml"


def _workflow() -> str:
    """Return the trusted central review workflow text."""
    return WORKFLOW_PATH.read_text(encoding="utf-8")


def _job_section(workflow: str, job_name: str, next_job_name: str | None = None) -> str:
    """Return one top-level job section using stable two-space YAML indentation."""
    start_marker = f"  {job_name}:\n"
    start = workflow.index(start_marker)
    if next_job_name is None:
        return workflow[start:]
    end_marker = f"  {next_job_name}:\n"
    end = workflow.index(end_marker, start + len(start_marker))
    return workflow[start:end]


def test_review_workflow_splits_collection_from_secret_bearing_publication() -> None:
    """Untrusted repository parsing must finish before LLM and write secrets exist."""
    workflow = _workflow()
    collect = _job_section(workflow, "collect_evidence", "publish_review")
    publish = _job_section(workflow, "publish_review")

    assert "name: noema-evidence-collection" in collect
    assert "name: noema-review-publication" in publish
    assert "needs: collect_evidence" in publish
    assert "NOEMA_LLM_API_KEY" not in collect
    assert "NOEMA_LLM_API_KEY: ${{ secrets.NOEMA_LLM_API_KEY }}" in publish
    assert "Checkout exact target head without executing target code" in collect
    assert "Checkout exact target head without executing target code" not in publish
    assert "target-source" not in publish


def test_collection_token_is_read_only_and_publication_token_owns_the_write() -> None:
    """The job handling target files must never receive pull-request write authority."""
    workflow = _workflow()
    collect = _job_section(workflow, "collect_evidence", "publish_review")
    publish = _job_section(workflow, "publish_review")

    assert "permission-pull-requests: read" in collect
    assert "permission-pull-requests: write" not in collect
    assert "permission-pull-requests: write" in publish
    assert "permission-contents: read" in collect
    assert "permission-checks: read" in collect
    assert "permission-security-events: read" in collect
    assert "permission-vulnerability-alerts: read" in collect


def test_collection_serializes_a_bounded_manifest_without_invoking_the_model() -> None:
    """The evidence job may build a manifest but cannot review or publish a verdict."""
    workflow = _workflow()
    collect = _job_section(workflow, "collect_evidence", "publish_review")

    assert "from noema_reviewer.github_io import fetch_manifest" in collect
    assert "model_dump_json(indent=2)" in collect
    assert "noema-manifest.json" in collect
    assert "--publish" not in collect
    assert "NOEMA_LLM_MODEL" not in collect
    assert "contextual-orchestrator" not in collect


def test_manifest_handoff_is_short_lived_and_integrity_checked() -> None:
    """The publication job must verify the exact evidence bytes it consumes."""
    workflow = _workflow()
    collect = _job_section(workflow, "collect_evidence", "publish_review")
    publish = _job_section(workflow, "publish_review")

    assert "actions/upload-artifact@" in collect
    assert "if-no-files-found: error" in collect
    assert "retention-days: 1" in collect
    assert "noema-manifest.sha256" in collect
    assert "actions/download-artifact@" in publish
    assert "sha256sum --check noema-manifest.sha256" in publish
    assert "manifest.head_sha != expected_head" in publish
    assert "manifest.repo != target_repository" in publish
    assert "manifest.pr_number != pr_number" in publish


def test_publication_uses_only_the_prepared_manifest_and_revalidates_the_live_head() -> None:
    """Publication must not rebuild evidence after privileged credentials are introduced."""
    workflow = _workflow()
    publish = _job_section(workflow, "publish_review")

    assert "--manifest-file" in publish
    assert "--source-root" not in publish
    assert "--publish" in publish
    assert "live_head" in publish
    assert "EXPECTED_HEAD_SHA" in publish
    assert "Noema refused stale or mismatched manifest evidence" in publish


def test_job_level_permissions_are_explicit_and_minimal() -> None:
    """Each trust domain must declare its own GitHub token permissions."""
    workflow = _workflow()
    collect = _job_section(workflow, "collect_evidence", "publish_review")
    publish = _job_section(workflow, "publish_review")

    assert "permissions:\n      contents: read" in collect
    assert "permissions:\n      contents: read" in publish
    assert "models: read" not in collect
    assert "models: read" not in publish
