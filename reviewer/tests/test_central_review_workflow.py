"""Contracts for the trusted central Noema review workflow."""

from pathlib import Path


def _workflow() -> str:
    """Return the trusted central-review workflow text."""
    repo_root = Path(__file__).resolve().parents[2]
    return (repo_root / ".github/workflows/central-review.yml").read_text(
        encoding="utf-8"
    )


def test_target_pr_binding_uses_repository_scoped_app_token() -> None:
    """Private target PR identity must be read only after target-scoped App auth."""
    workflow = _workflow()
    validate_index = workflow.index("Validate target repository identifier")
    mint_index = workflow.index("Mint read-only repository-scoped Noema App token")
    bind_index = workflow.index("Bind dispatch to live organization PR head")
    checkout_index = workflow.index("Checkout trusted Noema reviewer")

    assert validate_index < mint_index < bind_index < checkout_index
    bind_end = workflow.index("      - name:", bind_index + 1)
    bind_step = workflow[bind_index:bind_end]
    assert "GH_TOKEN: ${{ steps.noema_read_app.outputs.token }}" in bind_step
    assert "GH_TOKEN: ${{ github.token }}" not in bind_step
    assert 'gh api "repos/${TARGET_REPOSITORY}/pulls/${PR_NUMBER}"' in bind_step


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


def test_review_manifest_requires_attested_provenance_before_publication() -> None:
    """The privileged publication job must consume only a signed trusted-workflow manifest."""
    workflow = _workflow()
    collect_index = workflow.index("  collect_evidence:")
    attest_index = workflow.index("  attest_evidence:")
    publish_index = workflow.index("  publish_review:")
    attest_job = workflow[attest_index:publish_index]
    publish_job = workflow[publish_index:]

    assert collect_index < attest_index < publish_index
    assert "needs: collect_evidence" in attest_job
    assert "id-token: write" in attest_job
    assert "attestations: write" in attest_job
    assert "contents: read" in attest_job
    assert "pull-requests: write" not in attest_job
    assert "NOEMA_GITHUB_APP_PRIVATE_KEY" not in attest_job
    assert "NOEMA_LLM_API_KEY" not in attest_job
    assert "target-source" not in attest_job
    assert "sha256sum --check noema-manifest.sha256" in attest_job
    assert '.repo == $repo and .pr_number == $pr and .head_sha == $head' in attest_job
    assert "actions/attest@59d89421af93a897026c735860bf21b6eb4f7b26 # v4.1.0" in attest_job
    assert "create-storage-record: false" in attest_job
    assert "noema-manifest-attestation-${{ needs.collect_evidence.outputs.head_sha }}" in attest_job
    assert "retention-days: 1" in attest_job

    assert "needs: [collect_evidence, attest_evidence]" in publish_job
    assert "Download signed manifest attestation" in publish_job
    verification_index = publish_job.index("Verify manifest provenance and current-head binding")
    parse_index = publish_job.index("manifest_repo=", verification_index)
    assert verification_index < parse_index
    assert "gh attestation verify noema-manifest.json" in publish_job
    assert "--bundle noema-manifest-attestation.json" in publish_job
    assert "--repo ContextualWisdomLab/noema" in publish_job
    assert (
        "--signer-workflow ContextualWisdomLab/noema/.github/workflows/central-review.yml"
        in publish_job
    )
    assert '--signer-digest "$GITHUB_SHA"' in publish_job
    assert '--source-digest "$GITHUB_SHA"' in publish_job
    assert "--source-ref refs/heads/main" in publish_job
    assert "--cert-oidc-issuer https://token.actions.githubusercontent.com" in publish_job
    assert "--deny-self-hosted-runners" in publish_job
