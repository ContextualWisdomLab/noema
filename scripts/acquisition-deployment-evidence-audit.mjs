#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { evaluateAcquisitionDeploymentEvidence } from "./lib/acquisition-deployment-evidence.mjs";

const MAX_EVIDENCE_BYTES = 16 * 1024 * 1024;
const now = new Date().toISOString();
const releaseUnderDiligenceTag = String(
  process.env.NOEMA_RELEASE_UNDER_DILIGENCE_TAG || "",
).trim();
const outputDir = process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const auditPath = process.env.NOEMA_DEPLOYMENT_EVIDENCE_AUDIT_PATH
  || join(outputDir, "deployment-evidence-audit.json");
const deploymentEvidencePath = process.env.NOEMA_DEPLOYMENT_EVIDENCE_PATH
  || "artifacts/acquisition/deployment-evidence.json";
const attestationBundlePath = process.env.NOEMA_DEPLOYMENT_ATTESTATION_PATH
  || "artifacts/acquisition/deployment-evidence.sigstore.json";
const verificationReceiptPath = process.env.NOEMA_DEPLOYMENT_ATTESTATION_VERIFICATION_PATH
  || "artifacts/acquisition/deployment-attestation-verification.json";
const governanceEvidencePath = process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH
  || "artifacts/acquisition/production-environment-governance.json";

function bounded(value, maximum = 4_000) {
  const compact = String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, maximum)}…`;
}

function readRegularText(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} is missing: ${path}`);
  }
  const lstat = lstatSync(path);
  const stat = statSync(path);
  if (lstat.isSymbolicLink() || !stat.isFile() || stat.size <= 0 || stat.size > MAX_EVIDENCE_BYTES) {
    throw new Error(`${label} must be a non-empty regular file no larger than ${MAX_EVIDENCE_BYTES} bytes`);
  }
  return readFileSync(path, "utf8");
}

function readJson(path, label) {
  const text = readRegularText(path, label);
  try {
    return { text, value: JSON.parse(text) };
  } catch (error) {
    throw new Error(`${label} is invalid JSON: ${bounded(error?.message || error)}`);
  }
}

function readBundle(path) {
  const text = readRegularText(path, "deployment attestation bundle");
  try {
    return JSON.parse(text);
  } catch {
    const values = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (error) {
          throw new Error(
            `deployment attestation bundle JSONL record ${index + 1} is invalid: ${bounded(error?.message || error)}`,
          );
        }
      });
    if (values.length === 0) {
      throw new Error("deployment attestation bundle is empty");
    }
    return values;
  }
}

function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

function writeAudit(report) {
  mkdirSync(dirname(auditPath), { recursive: true });
  writeFileSync(auditPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function selectedEvidencePaths() {
  return {
    deploymentEvidencePath,
    attestationBundlePath,
    verificationReceiptPath,
    governanceEvidencePath,
  };
}

function notSelectedReport() {
  return {
    schemaVersion: 1,
    generatedAt: now,
    releaseUnderDiligenceTag: null,
    passed: false,
    status: "NOT_SELECTED",
    reportOnly: process.env.NOEMA_AUDIT_REPORT_ONLY === "1",
    evidencePaths: selectedEvidencePaths(),
    failures: [],
    limitations: [
      "Select NOEMA_RELEASE_UNDER_DILIGENCE_TAG before treating deployment evidence as an acquisition gate.",
      "The buyer must independently run gh attestation verify; structural bundle validation is not cryptographic verification.",
    ],
  };
}

function evaluateSelectedRelease() {
  const deployment = readJson(deploymentEvidencePath, "deployment evidence");
  const governance = readJson(governanceEvidencePath, "production environment governance evidence");
  const receipt = readJson(verificationReceiptPath, "deployment attestation verification receipt");
  const attestationBundle = readBundle(attestationBundlePath);
  const evaluation = evaluateAcquisitionDeploymentEvidence({
    expectedTag: releaseUnderDiligenceTag,
    deploymentEvidence: deployment.value,
    deploymentEvidenceSha256: sha256(deployment.text),
    governanceEvidence: governance.value,
    attestationBundle,
    verificationReceipt: receipt.value,
  });
  return {
    schemaVersion: 1,
    generatedAt: now,
    releaseUnderDiligenceTag,
    passed: evaluation.pass,
    status: evaluation.pass ? "PASS" : process.env.NOEMA_AUDIT_REPORT_ONLY === "1" ? "NOT_READY" : "FAIL",
    reportOnly: process.env.NOEMA_AUDIT_REPORT_ONLY === "1",
    evidencePaths: selectedEvidencePaths(),
    deployment: {
      repository: deployment.value?.source?.repository,
      commitSha: deployment.value?.source?.commitSha,
      workerVersionId: deployment.value?.deployment?.workerVersionId,
      deploymentId: deployment.value?.deployment?.deploymentId,
      workflowRunUrl: deployment.value?.deployment?.workflowRunUrl,
    },
    governance: {
      status: governance.value?.status,
      reviewerCount: governance.value?.reviewer_count,
    },
    failures: evaluation.failures,
    limitations: [
      "The buyer must independently run gh attestation verify against deployment-evidence.json and the retained bundle.",
      "This evidence does not prove paid customer operation, revenue, or completed account transfer.",
    ],
  };
}

let report;
if (!releaseUnderDiligenceTag) {
  report = notSelectedReport();
} else {
  try {
    report = evaluateSelectedRelease();
  } catch (error) {
    report = {
      schemaVersion: 1,
      generatedAt: now,
      releaseUnderDiligenceTag,
      passed: false,
      status: process.env.NOEMA_AUDIT_REPORT_ONLY === "1" ? "NOT_READY" : "FAIL",
      reportOnly: process.env.NOEMA_AUDIT_REPORT_ONLY === "1",
      evidencePaths: selectedEvidencePaths(),
      failures: [
        {
          code: "deployment_evidence_collection_failed",
          detail: bounded(error?.message || error),
        },
      ],
      limitations: [
        "The buyer must independently run gh attestation verify against deployment-evidence.json and the retained bundle.",
      ],
    };
  }
}

writeAudit(report);
console.log(`acquisition-deployment-evidence-audit: ${report.status}`);
console.log(`audit_file=${auditPath}`);
for (const failure of report.failures) {
  console.log(`- ${failure.code}: ${failure.detail}`);
}
if (report.status === "FAIL") {
  process.exitCode = 1;
}
