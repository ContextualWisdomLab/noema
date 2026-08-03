import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { evaluateAcquisitionDeploymentEvidence } from "../scripts/lib/acquisition-deployment-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const releaseTag = "v0.1.0";
const commitSha = "a".repeat(40);
const predicateType = "https://contextualwisdomlab.org/attestations/noema-deployment/v1";

function fixture() {
  const deploymentEvidence = {
    schemaVersion: 1,
    generatedAt: "2026-08-04T00:00:00.000Z",
    source: {
      repository,
      releaseTag,
      releaseRef: `refs/tags/${releaseTag}`,
      releaseUrl: `https://github.com/${repository}/releases/tag/${releaseTag}`,
      version: "0.1.0",
      commitSha,
      releaseEvidenceSha256: "1".repeat(64),
    },
    deployment: {
      environment: "production",
      workerName: "noema",
      workerVersionId: "worker-version-one",
      deploymentId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      deployedAt: "2026-08-04T00:00:01.000Z",
      deploymentCreatedAt: "2026-08-04T00:00:02.000Z",
      trafficPercentage: 100,
      targets: ["https://noema.example.workers.dev"],
      workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
    },
    rollback: {
      previousDeploymentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      previousWorkerVersionId: "worker-version-zero",
    },
    validation: {
      immutableRelease: true,
      strictKpi: true,
      smokePassed: true,
      kpiExecutedAt: "2026-08-03T23:59:50.000Z",
      smokeTimestamp: "2026-08-04T00:00:04.000Z",
      kpiEvidenceSha256: "2".repeat(64),
      smokeEvidenceSha256: "3".repeat(64),
    },
  };
  const deploymentEvidenceSha256 = createHash("sha256")
    .update(`${JSON.stringify(deploymentEvidence, null, 2)}\n`)
    .digest("hex");
  return {
    expectedTag: releaseTag,
    deploymentEvidence,
    deploymentEvidenceSha256,
    governanceEvidence: {
      schema_version: 1,
      repository,
      environment: "production",
      status: "PASS",
      reviewer_count: 1,
      reviewers: [{ type: "Team", id: 42, identifier: "production-approvers" }],
      checks: [
        { name: "required reviewers rule exists", pass: true, detail: "rule_count=1" },
        { name: "deployment initiator cannot self-approve", pass: true, detail: "prevent_self_review=true" },
        { name: "only protected branches may deploy", pass: true, detail: "protected_branches=true" },
      ],
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
      predicateType,
      oidcIssuer: "https://token.actions.githubusercontent.com",
      denySelfHostedRunners: true,
      workflowRunUrl: `https://github.com/${repository}/actions/runs/123`,
    },
  };
}

function failureCodes(result: ReturnType<typeof evaluateAcquisitionDeploymentEvidence>) {
  return result.failures.map((failure) => failure.code);
}

function writeFixture(root: string, input = fixture()) {
  const deploymentPath = join(root, "deployment-evidence.json");
  const governancePath = join(root, "production-environment-governance.json");
  const bundlePath = join(root, "deployment-evidence.sigstore.json");
  const receiptPath = join(root, "deployment-attestation-verification.json");
  writeFileSync(deploymentPath, `${JSON.stringify(input.deploymentEvidence, null, 2)}\n`);
  writeFileSync(governancePath, `${JSON.stringify(input.governanceEvidence, null, 2)}\n`);
  writeFileSync(bundlePath, `${JSON.stringify(input.attestationBundle)}\n`);
  writeFileSync(receiptPath, `${JSON.stringify(input.verificationReceipt, null, 2)}\n`);
  return { deploymentPath, governancePath, bundlePath, receiptPath };
}

function runAudit(root: string, paths: ReturnType<typeof writeFixture>, extraEnv = {}) {
  return spawnSync(process.execPath, ["scripts/acquisition-deployment-evidence-audit.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      NOEMA_RELEASE_UNDER_DILIGENCE_TAG: releaseTag,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: root,
      NOEMA_DEPLOYMENT_EVIDENCE_PATH: paths.deploymentPath,
      NOEMA_DEPLOYMENT_ATTESTATION_PATH: paths.bundlePath,
      NOEMA_DEPLOYMENT_ATTESTATION_VERIFICATION_PATH: paths.receiptPath,
      NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: paths.governancePath,
      ...extraEnv,
    },
  });
}

describe("acquisition deployment evidence", () => {
  it("passes a cross-bound production deployment evidence set", () => {
    expect(evaluateAcquisitionDeploymentEvidence(fixture())).toEqual({
      pass: true,
      failures: [],
    });
  });

  it.each([
    ["wrong selected tag", (input: ReturnType<typeof fixture>) => { input.expectedTag = "v0.2.0"; }, "deployment_release_tag_mismatch"],
    ["wrong release ref", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.source.releaseRef = "refs/heads/main"; }, "deployment_release_ref_mismatch"],
    ["wrong repository", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.source.repository = "outside/noema"; }, "deployment_repository_mismatch"],
    ["non-production deployment", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.deployment.environment = "staging"; }, "deployment_environment_mismatch"],
    ["wrong Worker", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.deployment.workerName = "other"; }, "deployment_worker_mismatch"],
    ["traffic split", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.deployment.trafficPercentage = 50; }, "deployment_traffic_not_full"],
    ["mutable release", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.validation.immutableRelease = false; }, "deployment_release_not_immutable"],
    ["non-strict KPI", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.validation.strictKpi = false; }, "deployment_kpi_not_strict"],
    ["failed smoke", (input: ReturnType<typeof fixture>) => { input.deploymentEvidence.validation.smokePassed = false; }, "deployment_smoke_failed"],
    ["failed governance", (input: ReturnType<typeof fixture>) => { input.governanceEvidence.status = "FAIL"; }, "governance_status_not_pass"],
    ["empty reviewers", (input: ReturnType<typeof fixture>) => { input.governanceEvidence.reviewer_count = 0; input.governanceEvidence.reviewers = []; }, "governance_reviewer_missing"],
    ["failed governance check", (input: ReturnType<typeof fixture>) => { input.governanceEvidence.checks[0].pass = false; }, "governance_check_failed"],
    ["governance failures", (input: ReturnType<typeof fixture>) => { input.governanceEvidence.failures = [{ code: "weak_policy" }]; }, "governance_failures_present"],
    ["unverified receipt", (input: ReturnType<typeof fixture>) => { input.verificationReceipt.verified = false; }, "attestation_not_verified"],
    ["wrong signer workflow", (input: ReturnType<typeof fixture>) => { input.verificationReceipt.signerWorkflow = "outside/repo/workflow.yml"; }, "attestation_signer_mismatch"],
    ["wrong OIDC issuer", (input: ReturnType<typeof fixture>) => { input.verificationReceipt.oidcIssuer = "https://issuer.example"; }, "attestation_oidc_issuer_mismatch"],
    ["self-hosted runners allowed", (input: ReturnType<typeof fixture>) => { input.verificationReceipt.denySelfHostedRunners = false; }, "attestation_runner_policy_missing"],
    ["digest mismatch", (input: ReturnType<typeof fixture>) => { input.verificationReceipt.deploymentEvidenceSha256 = "f".repeat(64); }, "attestation_subject_digest_mismatch"],
  ])("fails closed for %s", (_label, mutate, expectedCode) => {
    const input = fixture();
    mutate(input);

    const result = evaluateAcquisitionDeploymentEvidence(input);

    expect(result.pass).toBe(false);
    expect(failureCodes(result)).toContain(expectedCode);
  });

  it("rejects a malformed or empty Sigstore bundle", () => {
    const malformed = fixture();
    malformed.attestationBundle = {};
    expect(failureCodes(evaluateAcquisitionDeploymentEvidence(malformed)))
      .toContain("attestation_bundle_invalid");

    const missingSignature = fixture();
    missingSignature.attestationBundle.dsseEnvelope.signatures = [];
    expect(failureCodes(evaluateAcquisitionDeploymentEvidence(missingSignature)))
      .toContain("attestation_bundle_invalid");
  });

  it("audits real files and fails when the verification receipt digest is changed", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-deployment-audit-"));
    try {
      const input = fixture();
      const paths = writeFixture(root, input);
      const passing = runAudit(root, paths);
      expect(passing.status).toBe(0);
      expect(passing.stdout).toContain("acquisition-deployment-evidence-audit: PASS");

      input.verificationReceipt.deploymentEvidenceSha256 = "f".repeat(64);
      writeFileSync(paths.receiptPath, `${JSON.stringify(input.verificationReceipt, null, 2)}\n`);
      const failing = runAudit(root, paths);
      expect(failing.status).toBe(1);
      expect(failing.stdout).toContain("attestation_subject_digest_mismatch");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("records an unselected release without inventing deployment evidence", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-deployment-unselected-"));
    try {
      const result = spawnSync(process.execPath, ["scripts/acquisition-deployment-evidence-audit.mjs"], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
          NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: root,
        },
      });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("acquisition-deployment-evidence-audit: NOT_SELECTED");
      const report = JSON.parse(readFileSync(join(root, "deployment-evidence-audit.json"), "utf8"));
      expect(report.passed).toBe(false);
      expect(report.releaseUnderDiligenceTag).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires the trusted CD workflow to emit and retain a verification receipt", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const verifyIndex = workflow.indexOf("gh attestation verify deployment-evidence.json");
    const receiptIndex = workflow.indexOf("deployment-attestation-verification.json");

    expect(verifyIndex).toBeGreaterThan(-1);
    expect(receiptIndex).toBeGreaterThan(verifyIndex);
    expect(workflow).toContain("deploymentEvidenceSha256");
    expect(workflow).toContain("denySelfHostedRunners: true");
    expect(workflow).toContain("deployment-attestation-verification.json");
    expect(workflow).toContain("retention-days: 365");
  });

  it("chains deployment evidence through the public acquisition audit command", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    expect(packageJson.scripts["acquisition:deployment-evidence"])
      .toBe("node scripts/acquisition-deployment-evidence-audit.mjs");
    expect(packageJson.scripts["acquisition:audit"])
      .toContain("npm run acquisition:deployment-evidence");
  });
});
