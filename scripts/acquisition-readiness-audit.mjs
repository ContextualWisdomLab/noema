#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluatePilotReadinessText } from "./lib/pilot-readiness.mjs";

const now = new Date().toISOString();
const outputDir = process.env.NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const auditFile = join(outputDir, "acquisition-audit.json");
const objective = "NOEMA-GOAL-ACQUISITION-2B-2026-07-02";
const targetKrw = 2_000_000_000;
const revenueEvidencePath = process.env.NOEMA_REVENUE_EVIDENCE_PATH
  || "artifacts/acquisition/revenue-evidence.json";
const transferEvidencePath = process.env.NOEMA_TRANSFER_EVIDENCE_PATH
  || "artifacts/acquisition/transfer-evidence.json";
const pilotLogPath = process.env.NOEMA_PILOT_LOG_PATH
  || "docs/pilot-readiness-log.md";
const saleableEvidencePath = process.env.NOEMA_SALEABLE_AUDIT_PATH
  || latestSaleableAuditPath();
const dataRoomManifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");
const evidenceMaxAgeDays = parsePositiveNumber(process.env.NOEMA_ACQUISITION_EVIDENCE_MAX_AGE_DAYS, 45);
const checks = [];

function latestSaleableAuditPath() {
  const root = "artifacts/saleable-readiness";
  if (!existsSync(root)) {
    return join(root, "latest", "goal-audit.json");
  }
  const latestDir = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{8}$/.test(entry.name))
    .map((entry) => entry.name)
    .sort()
    .at(-1);
  return latestDir
    ? join(root, latestDir, "goal-audit.json")
    : join(root, "latest", "goal-audit.json");
}

function record(name, pass, details = {}) {
  checks.push({ name, pass, details });
}

function parsePositiveNumber(raw, fallback) {
  const value = Number(raw ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readJson(path) {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", path };
  }
  try {
    return { ok: true, path, value: JSON.parse(readFileSync(path, "utf8")) };
  } catch (error) {
    return { ok: false, reason: "invalid_json", path, error: error.message };
  }
}

function readText(path) {
  if (!existsSync(path)) {
    return { ok: false, reason: "missing", path };
  }
  try {
    return { ok: true, path, text: readFileSync(path, "utf8") };
  } catch (error) {
    return { ok: false, reason: "unreadable", path, error: error.message };
  }
}

function requireDoc(path, requiredText = []) {
  const doc = readText(path);
  if (!doc.ok) {
    record(`required acquisition artifact: ${path}`, false, doc);
    return;
  }
  const missingText = requiredText.filter((item) => !doc.text.includes(item));
  record(`required acquisition artifact: ${path}`, missingText.length === 0, {
    missingText,
  });
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonEmptyStringArray(value) {
  return Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);
}

function validateEvidenceMetadata(value) {
  const failures = [];
  const updatedAt = typeof value.updated_at === "string" ? value.updated_at.trim() : "";
  const updatedAtMs = Date.parse(updatedAt);
  const nowMs = Date.now();
  const maxAgeMs = evidenceMaxAgeDays * 24 * 60 * 60 * 1000;

  if (!isNonEmptyString(value.owner)) {
    failures.push("owner required");
  }
  if (!isNonEmptyStringArray(value.source_documents)) {
    failures.push("source_documents must contain at least one path or system id");
  }
  if (!updatedAt || Number.isNaN(updatedAtMs)) {
    failures.push("updated_at must be an ISO date or timestamp");
  } else if (updatedAtMs - nowMs > 24 * 60 * 60 * 1000) {
    failures.push("updated_at cannot be in the future");
  } else if (nowMs - updatedAtMs > maxAgeMs) {
    failures.push(`updated_at is older than ${evidenceMaxAgeDays} days`);
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

mkdirSync(outputDir, { recursive: true });

requireDoc("docs/acquisition-readiness-2b.md", [
  "NOEMA-GOAL-ACQUISITION-2B-2026-07-02",
  "KRW 2,000,000,000",
  "Revenue_PASS",
  "Transfer_PASS",
]);
requireDoc("docs/buyer-due-diligence-index.md", [
  "npm run acquisition:audit",
  "artifacts/acquisition/revenue-evidence.json",
  "artifacts/acquisition/transfer-evidence.json",
]);
requireDoc("docs/library-boundary-decision.md", [
  "현재는 submodule을 만들지 않는다",
  "npm workspaces",
  "Split Triggers",
]);
requireDoc("scripts/acquisition-data-room-manifest.mjs", [
  "finalGatePassed",
  "data-room-manifest.json",
]);
requireDoc("docs/saleable-program-goal-registry.md", [
  "NOEMA-GOAL-SALEABLE-2026-07-02",
]);
requireDoc("docs/pricing-draft.md");
requireDoc("docs/terms-draft.md");
requireDoc("docs/sla-and-support.md");

const pilotLog = readText(pilotLogPath);
if (!pilotLog.ok) {
  record("pilot production evidence pass", false, pilotLog);
} else {
  const pilotEvaluation = evaluatePilotReadinessText(pilotLog.text);
  record("pilot production evidence pass", pilotEvaluation.passed, {
    path: pilotLogPath,
    requiredFor: "Saleable_PASS and Buyer_DD_PASS",
    entries: pilotEvaluation.entries,
  });
}

const revenue = readJson(revenueEvidencePath);
if (!revenue.ok) {
  record("revenue evidence present", false, revenue);
} else {
  const value = revenue.value;
  const metadata = validateEvidenceMetadata(value);
  const arrRoute = Number(value.arr_krw) >= 300_000_000
    && Number(value.gross_margin) >= 0.7
    && Number(value.paid_customers) >= 3
    && Number(value.customer_concentration_top1) < 0.6;
  const pipelineRoute = Number(value.pipeline_weighted_krw) >= 500_000_000
    && Number(value.loi_count) >= 3
    && Number(value.paid_customers) >= 1
    && isNonEmptyStringArray(value.buyer_due_diligence_qna);
  record("revenue evidence supports 2B target", (arrRoute || pipelineRoute) && metadata.pass, {
    path: revenueEvidencePath,
    targetKrw,
    route: arrRoute ? "ARR" : pipelineRoute ? "strategic_pipeline" : "none",
    metadataFailures: metadata.failures,
    arr_krw: value.arr_krw,
    gross_margin: value.gross_margin,
    paid_customers: value.paid_customers,
    pipeline_weighted_krw: value.pipeline_weighted_krw,
    loi_count: value.loi_count,
    buyer_due_diligence_qna: value.buyer_due_diligence_qna,
    customer_concentration_top1: value.customer_concentration_top1,
    updated_at: value.updated_at,
    owner: value.owner,
    source_documents: value.source_documents,
  });
}

const transfer = readJson(transferEvidencePath);
if (!transfer.ok) {
  record("transfer evidence present", false, transfer);
} else {
  const metadata = validateEvidenceMetadata(transfer.value);
  const required = [
    "license_review",
    "third_party_review",
    "github_app_transfer_plan",
    "cloudflare_transfer_plan",
    "secrets_rotation_plan",
    "owner_transfer_plan",
    "privacy_review",
  ];
  const failing = required.filter((key) => transfer.value[key] !== "pass");
  record("transfer evidence pass", failing.length === 0 && metadata.pass, {
    path: transferEvidencePath,
    failing,
    metadataFailures: metadata.failures,
    updated_at: transfer.value.updated_at,
    owner: transfer.value.owner,
    source_documents: transfer.value.source_documents,
  });
}

const saleable = readJson(saleableEvidencePath);
if (!saleable.ok) {
  record("saleable readiness evidence present", false, saleable);
} else {
  record("saleable readiness pass", saleable.value.passed === true, {
    path: saleableEvidencePath,
    passed: saleable.value.passed,
    objective: saleable.value.objective,
  });
}

const dataRoom = readJson(dataRoomManifestPath);
if (!dataRoom.ok) {
  record("data room manifest present", false, dataRoom);
} else {
  record("data room manifest final gate pass", dataRoom.value.finalGatePassed === true && dataRoom.value.objective === objective, {
    path: dataRoomManifestPath,
    objective: dataRoom.value.objective,
    expectedObjective: objective,
    passed: dataRoom.value.passed,
    finalGatePassed: dataRoom.value.finalGatePassed,
    missingFinalGate: dataRoom.value.missingFinalGate,
  });
}

const failed = checks.filter((item) => !item.pass);
const output = {
  generatedAt: now,
  objective,
  targetKrw,
  evidenceMaxAgeDays,
  passed: failed.length === 0,
  revenueEvidencePath,
  transferEvidencePath,
  pilotLogPath,
  saleableEvidencePath,
  dataRoomManifestPath,
  checks,
};

writeFileSync(auditFile, JSON.stringify(output, null, 2));
console.log(`acquisition-readiness-audit: ${output.passed ? "PASS" : "FAIL"}`);
console.log(`audit_file=${auditFile}`);

if (!output.passed) {
  console.log("Failed checks:");
  failed.forEach((item) => console.log(`- ${item.name}`));
  process.exit(1);
}
