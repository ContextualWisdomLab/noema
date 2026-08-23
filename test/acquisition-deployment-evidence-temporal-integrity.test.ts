import { describe, expect, it } from "vitest";
import { evaluateAcquisitionDeploymentEvidence } from "../scripts/lib/acquisition-deployment-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const releaseTag = "v0.1.0";
const commitSha = "a".repeat(40);
const deploymentEvidenceSha256 = "b".repeat(64);

function fixture() {
  return {
    expectedTag: releaseTag,
    deploymentEvidence: {
      schemaVersion: 1,
      generatedAt: "2026-08-04T00:00:00.000Z",
      source: {
        repository,
        releaseTag,
        releaseRef: `refs/tags/${releaseTag}`,
        commitSha,
      },
      deployment: {
        environment: "production",
        workerName: "noema",
        trafficPercentage: 100,
        workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
        deployedAt: "2026-08-04T00:00:01.000Z",
        deploymentCreatedAt: "2026-08-04T00:00:02.000Z",
      },
      validation: {
        immutableRelease: true,
        strictKpi: true,
        smokePassed: true,
        kpiExecutedAt: "2026-08-03T23:59:50.000Z",
        smokeTimestamp: "2026-08-04T00:00:04.000Z",
      },
    },
    deploymentEvidenceSha256,
    governanceEvidence: {
      schema_version: 1,
      repository,
      environment: "production",
      status: "PASS",
      reviewer_count: 1,
      reviewers: [{ type: "Team", id: 42, identifier: "production-approvers" }],
      checks: [{ name: "reviewed", pass: true, detail: "reviewed" }],
      failures: [],
    },
    attestationBundle: {
      mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
      verificationMaterial: { tlogEntries: [{}] },
      dsseEnvelope: { payload: "ZXZpZGVuY2U=", signatures: [{ sig: "c2ln" }] },
    },
    verificationReceipt: {
      schemaVersion: 1,
      verified: true,
      repository,
      releaseTag,
      commitSha,
      deploymentEvidenceSha256,
      signerWorkflow: `${repository}/.github/workflows/cd.yml`,
      predicateType: "https://contextualwisdomlab.org/attestations/noema-deployment/v1",
      oidcIssuer: "https://token.actions.githubusercontent.com",
      denySelfHostedRunners: true,
      workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
    },
  };
}

function codes(input: ReturnType<typeof fixture>) {
  return evaluateAcquisitionDeploymentEvidence(input).failures.map((entry) => entry.code);
}

describe("acquisition deployment temporal evidence integrity", () => {
  it.each([
    ["generatedAt", (input: ReturnType<typeof fixture>) => {
      input.deploymentEvidence.generatedAt = "2999-01-01T00:00:00.000Z";
    }, "deployment_generated_at_invalid"],
    ["deployedAt", (input: ReturnType<typeof fixture>) => {
      input.deploymentEvidence.deployment.deployedAt = "2999-01-01T00:00:00.000Z";
    }, "deployment_deployed_at_invalid"],
    ["deploymentCreatedAt", (input: ReturnType<typeof fixture>) => {
      input.deploymentEvidence.deployment.deploymentCreatedAt = "2999-01-01T00:00:00.000Z";
    }, "deployment_created_at_invalid"],
    ["kpiExecutedAt", (input: ReturnType<typeof fixture>) => {
      input.deploymentEvidence.validation.kpiExecutedAt = "2999-01-01T00:00:00.000Z";
    }, "deployment_kpi_timestamp_invalid"],
    ["smokeTimestamp", (input: ReturnType<typeof fixture>) => {
      input.deploymentEvidence.validation.smokeTimestamp = "2999-01-01T00:00:00.000Z";
    }, "deployment_smoke_timestamp_invalid"],
  ])("rejects future-dated %s retained acquisition evidence", (_label, mutate, expectedCode) => {
    const input = fixture();
    mutate(input);

    const result = evaluateAcquisitionDeploymentEvidence(input);

    expect(result.pass).toBe(false);
    expect(codes(input)).toContain(expectedCode);
  });

  it("does not coerce string traffic percentage into deployment authority", () => {
    const input = fixture();
    (input.deploymentEvidence.deployment as { trafficPercentage: number | string }).trafficPercentage = "100";

    const result = evaluateAcquisitionDeploymentEvidence(input);

    expect(result.pass).toBe(false);
    expect(codes(input)).toContain("deployment_traffic_not_full");
  });

  it("does not coerce string reviewer counts into governance authority", () => {
    const input = fixture();
    (input.governanceEvidence as { reviewer_count: number | string }).reviewer_count = "1";

    const result = evaluateAcquisitionDeploymentEvidence(input);

    expect(result.pass).toBe(false);
    expect(codes(input)).toContain("governance_reviewer_missing");
  });
});
