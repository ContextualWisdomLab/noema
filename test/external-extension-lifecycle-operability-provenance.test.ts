import { describe, expect, it } from "vitest";
import { evaluateExternalExtensionLifecycleOperabilityEvidence } from "../scripts/lib/external-extension-lifecycle-operability-evidence.mjs";
import { evaluateExternalExtensionLifecycleOperabilityEvidenceWithDeploymentAuthority } from "../scripts/lib/external-extension-lifecycle-deployment-authority.mjs";

const latency = (value: number, count = 100): number[] => Array.from({ length: count }, () => value);
const lifecycleEvidenceSha256 = "e".repeat(64);

function passingLifecycleEvidence(commitSha = "a".repeat(40)) {
  return {
    schema_version: 1,
    source_kind: "cloudflare_durable_object_remote",
    repository_full_name: "ContextualWisdomLab/noema",
    protected_main_sha: commitSha,
    deployed_worker_sha: commitSha,
    observed_at: "2026-09-09T12:30:00.000Z",
    binding_name: "NOEMA_EXTERNAL_EXTENSION_LIFECYCLE",
    storage_backend: "sqlite",
    read_current: { planned_samples: 100, latency_ms: latency(7), failure_count: 0, warmup_excluded_count: 0 },
    contended_append: {
      planned_samples: 100,
      latency_ms: latency(12),
      failure_count: 0,
      warmup_excluded_count: 0,
      contention_trials: 50,
      accepted_winners: 50,
      conflict_losers: 50,
    },
    recovery: {
      retained_event_count: 137,
      complete_audit_rebuild_verified: true,
      restart_recovery_verified: true,
      rollback_recovery_verified: true,
      malformed_head_rejected: true,
      truncated_audit_rejected: true,
    },
    storage: { bytes_before: 12_288, bytes_after: 98_304 },
  };
}

function passingDeploymentAuthority(commitSha = "a".repeat(40)) {
  const tag = "v0.1.0";
  const workflowRunUrl = "https://github.com/ContextualWisdomLab/noema/actions/runs/34390000000";
  const deploymentEvidenceSha256 = "d".repeat(64);
  return {
    expectedTag: tag,
    deploymentEvidenceSha256,
    deploymentEvidence: {
      schemaVersion: 1,
      generatedAt: "2026-09-09T12:00:00.000Z",
      source: { repository: "ContextualWisdomLab/noema", releaseTag: tag, releaseRef: `refs/tags/${tag}`, commitSha },
      deployment: {
        environment: "production",
        workerName: "noema",
        trafficPercentage: 100,
        workflowRunUrl,
        deployedAt: "2026-09-09T12:05:00.000Z",
        deploymentCreatedAt: "2026-09-09T12:04:00.000Z",
      },
      validation: {
        immutableRelease: true,
        strictKpi: true,
        smokePassed: true,
        kpiExecutedAt: "2026-09-09T12:06:00.000Z",
        smokeTimestamp: "2026-09-09T12:07:00.000Z",
      },
    },
    governanceEvidence: {
      schema_version: 1,
      repository: "ContextualWisdomLab/noema",
      environment: "production",
      status: "PASS",
      reviewer_count: 1,
      reviewers: ["release-reviewer"],
      checks: [{ code: "deployment_reviewer", pass: true }],
      failures: [],
    },
    attestationBundle: {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: {},
      dsseEnvelope: { payload: "signed-payload", signatures: [{ sig: "signed" }] },
    },
    verificationReceipt: {
      schemaVersion: 1,
      verified: true,
      repository: "ContextualWisdomLab/noema",
      releaseTag: tag,
      commitSha,
      deploymentEvidenceSha256,
      signerWorkflow: "ContextualWisdomLab/noema/.github/workflows/cd.yml",
      predicateType: "https://contextualwisdomlab.org/attestations/noema-deployment/v1",
      oidcIssuer: "https://token.actions.githubusercontent.com",
      denySelfHostedRunners: true,
      workflowRunUrl,
    },
  };
}

function passingLifecycleReceipt(commitSha = "a".repeat(40)) {
  return {
    schemaVersion: 1,
    verified: true,
    repository: "ContextualWisdomLab/noema",
    releaseTag: "v0.1.0",
    commitSha,
    lifecycleEvidenceSha256,
    signerWorkflow: "ContextualWisdomLab/noema/.github/workflows/cd.yml",
    predicateType: "https://contextualwisdomlab.org/attestations/noema-lifecycle-operability/v1",
    oidcIssuer: "https://token.actions.githubusercontent.com",
    denySelfHostedRunners: true,
    workflowRunUrl: "https://github.com/ContextualWisdomLab/noema/actions/runs/34390000000",
  };
}

function evaluateBound(evidence = passingLifecycleEvidence(), authority = passingDeploymentAuthority(), receipt = passingLifecycleReceipt(), digest = lifecycleEvidenceSha256) {
  return evaluateExternalExtensionLifecycleOperabilityEvidenceWithDeploymentAuthority(evidence, authority, digest, receipt);
}

function failureCodes(result: { failures: Array<{ code: string }> }) {
  return result.failures.map((failure) => failure.code);
}

describe("external-extension lifecycle deployment provenance binding", () => {
  it("accepts lifecycle evidence only when deployment authority and its exact evidence attestation receipt agree", () => {
    const result = evaluateBound();
    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.checks).toEqual(expect.arrayContaining([
      { code: "deployment_authority", pass: true },
      { code: "deployment_revision_binding", pass: true },
      { code: "lifecycle_attestation_receipt", pass: true },
    ]));
  });

  it("rejects a shape-valid lifecycle observation whose revision is not the canonical deployed release commit", () => {
    const forged = passingLifecycleEvidence("b".repeat(40));
    expect(evaluateExternalExtensionLifecycleOperabilityEvidence(forged).status).toBe("PASS");
    const result = evaluateBound(forged);
    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toEqual(expect.arrayContaining([
      "deployment_revision_binding",
      "lifecycle_attestation_receipt",
    ]));
  });

  it("rejects lifecycle content that is not bound to the independently verified retained-byte digest", () => {
    const receipt = passingLifecycleReceipt();
    receipt.lifecycleEvidenceSha256 = "f".repeat(64);
    const result = evaluateBound(passingLifecycleEvidence(), passingDeploymentAuthority(), receipt);
    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain("lifecycle_attestation_receipt");
  });

  it("fails closed when canonical release provenance or trusted receipt identity is invalid", () => {
    const authority = passingDeploymentAuthority();
    authority.verificationReceipt.releaseTag = "v9.9.9";
    expect(failureCodes(evaluateBound(passingLifecycleEvidence(), authority))).toEqual(expect.arrayContaining([
      "deployment_authority",
      "deployment_revision_binding",
      "lifecycle_attestation_receipt",
    ]));

    const receipt = passingLifecycleReceipt();
    receipt.signerWorkflow = "ContextualWisdomLab/noema/.github/workflows/untrusted.yml";
    expect(failureCodes(evaluateBound(passingLifecycleEvidence(), passingDeploymentAuthority(), receipt))).toContain(
      "lifecycle_attestation_receipt",
    );
  });
});
