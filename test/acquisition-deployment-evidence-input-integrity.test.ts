import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const releaseTag = "v0.1.0";
const commitSha = "a".repeat(40);
const predicateType = "https://contextualwisdomlab.org/attestations/noema-deployment/v1";

function deploymentEvidence() {
  return {
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
}

function governanceEvidence() {
  return {
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
  };
}

function attestationBundle() {
  return {
    mediaType: "application/vnd.dev.sigstore.bundle.v0.3+json",
    verificationMaterial: { tlogEntries: [{}] },
    dsseEnvelope: { payload: "ZXZpZGVuY2U=", signatures: [{ sig: "c2ln" }] },
  };
}

function sha256(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function verificationReceipt(deploymentEvidenceSha256: string) {
  return {
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
  };
}

function writeInputs(root: string) {
  const deploymentPath = join(root, "deployment-evidence.json");
  const governancePath = join(root, "production-environment-governance.json");
  const bundlePath = join(root, "deployment-evidence.sigstore.json");
  const receiptPath = join(root, "deployment-attestation-verification.json");

  const deploymentBytes = Buffer.from(`${JSON.stringify(deploymentEvidence(), null, 2)}\n`, "utf8");
  writeFileSync(deploymentPath, deploymentBytes);
  writeFileSync(governancePath, `${JSON.stringify(governanceEvidence(), null, 2)}\n`);
  writeFileSync(bundlePath, `${JSON.stringify(attestationBundle())}\n`);
  writeFileSync(
    receiptPath,
    `${JSON.stringify(verificationReceipt(sha256(deploymentBytes)), null, 2)}\n`,
  );

  return { deploymentPath, governancePath, bundlePath, receiptPath };
}

function runAudit(
  root: string,
  paths: ReturnType<typeof writeInputs>,
  extraEnv: Record<string, string> = {},
) {
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

function malformedJsonBytes(value: object) {
  const text = JSON.stringify({ ...value, note: "MALFORMED_SENTINEL" }, null, 2);
  const [prefix, suffix] = text.split("MALFORMED_SENTINEL");
  return Buffer.concat([
    Buffer.from(prefix, "utf8"),
    Buffer.from([0xff]),
    Buffer.from(`${suffix}\n`, "utf8"),
  ]);
}

function writePathSwapPreload(root: string) {
  const preloadPath = join(root, "swap-after-lstat.cjs");
  writeFileSync(preloadPath, [
    'const fs = require("node:fs");',
    'const { syncBuiltinESMExports } = require("node:module");',
    'const originalLstatSync = fs.lstatSync;',
    'let swapped = false;',
    'fs.lstatSync = function patchedLstatSync(path, ...args) {',
    '  const metadata = originalLstatSync.call(this, path, ...args);',
    '  if (!swapped && String(path) === process.env.NOEMA_TEST_SWAP_PATH) {',
    '    swapped = true;',
    '    fs.unlinkSync(path);',
    '    fs.symlinkSync(process.env.NOEMA_TEST_SWAP_TARGET, path);',
    '  }',
    '  return metadata;',
    '};',
    'syncBuiltinESMExports();',
    '',
  ].join("\n"));
  return preloadPath;
}

describe("acquisition deployment evidence byte integrity", () => {
  it("keeps the valid exact-byte fixture passing", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      const result = runAudit(root, paths);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("acquisition-deployment-evidence-audit: PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects escape-equivalent duplicate keys in deployment evidence before diligence evaluation", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      const valid = JSON.stringify(deploymentEvidence(), null, 2);
      const ambiguous = valid.replace(
        `"repository": "${repository}"`,
        `"repository": "attacker/example",\n    "reposit\\u006fry": "${repository}"`,
      );
      const deploymentBytes = Buffer.from(`${ambiguous}\n`, "utf8");
      writeFileSync(paths.deploymentPath, deploymentBytes);
      writeFileSync(
        paths.receiptPath,
        `${JSON.stringify(verificationReceipt(sha256(deploymentBytes)), null, 2)}\n`,
      );

      const result = runAudit(root, paths);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("deployment_evidence_collection_failed");
      expect(result.stdout).toContain("duplicate decoded JSON object keys");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects escape-equivalent duplicate keys in a retained attestation bundle", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      const valid = JSON.stringify(attestationBundle());
      const ambiguous = valid.replace(
        '"mediaType":"application/vnd.dev.sigstore.bundle.v0.3+json"',
        '"mediaType":"text/plain","mediaT\\u0079pe":"application/vnd.dev.sigstore.bundle.v0.3+json"',
      );
      writeFileSync(paths.bundlePath, `${ambiguous}\n`);

      const result = runAudit(root, paths);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("deployment_evidence_collection_failed");
      expect(result.stdout).toContain("duplicate decoded JSON object keys");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 deployment evidence even when the receipt matches replacement-decoded text", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      const malformed = malformedJsonBytes(deploymentEvidence());
      writeFileSync(paths.deploymentPath, malformed);

      const replacementDecodedDigest = sha256(malformed.toString("utf8"));
      writeFileSync(
        paths.receiptPath,
        `${JSON.stringify(verificationReceipt(replacementDecodedDigest), null, 2)}\n`,
      );

      const result = runAudit(root, paths);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("deployment_evidence_collection_failed");
      expect(result.stdout).toContain("invalid UTF-8");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed UTF-8 in the retained attestation bundle", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      writeFileSync(paths.bundlePath, malformedJsonBytes(attestationBundle()));

      const result = runAudit(root, paths);

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("deployment_evidence_collection_failed");
      expect(result.stdout).toContain("invalid UTF-8");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a deployment evidence path swapped to a symlink after metadata validation", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-deployment-bytes-"));
    try {
      const paths = writeInputs(root);
      const replacementPath = join(root, "replacement-deployment-evidence.json");
      const replacementBytes = Buffer.from(
        `${JSON.stringify({ ...deploymentEvidence(), note: "replacement" }, null, 2)}\n`,
        "utf8",
      );
      writeFileSync(replacementPath, replacementBytes);
      writeFileSync(
        paths.receiptPath,
        `${JSON.stringify(verificationReceipt(sha256(replacementBytes)), null, 2)}\n`,
      );
      const preloadPath = writePathSwapPreload(root);

      const result = runAudit(root, paths, {
        NODE_OPTIONS: `--require=${preloadPath}`,
        NOEMA_TEST_SWAP_PATH: paths.deploymentPath,
        NOEMA_TEST_SWAP_TARGET: replacementPath,
      });

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("deployment_evidence_collection_failed");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});