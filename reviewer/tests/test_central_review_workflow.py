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


def test_untrusted_codegraph_analysis_uses_an_authenticated_quarantine_image() -> None:
    """Target parsing must use a signed, scanned, immutable no-network image."""
    workflow = _workflow()
    source_image = "gcr.io/distroless/nodejs24-debian13:nonroot"

    assert f"NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE: {source_image}" in workflow
    resolve_index = workflow.index("Resolve, authenticate, and scan CodeGraph sandbox image")
    collect_index = workflow.index("Collect bounded current-head review manifest")
    assert resolve_index < collect_index
    assert 'docker pull "$NOEMA_CODEGRAPH_SANDBOX_SOURCE_IMAGE"' in workflow
    assert "gcr.io/distroless/nodejs24-debian13@sha256:" in workflow
    assert "sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6" in workflow
    assert "aquasecurity/setup-trivy@81e514348e19b6112ce2a7e3ecbafe19c1e1f567" in workflow
    assert "--certificate-oidc-issuer=https://accounts.google.com" in workflow
    assert "--certificate-identity=keyless@distroless.iam.gserviceaccount.com" in workflow
    assert "trivy image" in workflow
    assert "--severity MEDIUM,HIGH,CRITICAL" in workflow
    assert 'printf \'NOEMA_CODEGRAPH_SANDBOX_IMAGE=%s\\n\' "$resolved" >>"$GITHUB_ENV"' in workflow
    assert "from noema_reviewer.sandbox import DockerCodeGraphRunner" in workflow
    assert "codegraph_runner=DockerCodeGraphRunner()" in workflow
    assert "source_root=source_root" in workflow
    assert "NOEMA_LLM_API_KEY" not in workflow[resolve_index:collect_index]
