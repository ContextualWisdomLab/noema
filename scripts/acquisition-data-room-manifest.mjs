#!/usr/bin/env node
import { createHash } from "node:crypto";
import { closeSync, existsSync, mkdirSync, openSync, readSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const now = new Date().toISOString();
const outputDir = process.env.NOEMA_DATA_ROOM_OUTPUT_DIR
  || join(process.cwd(), "artifacts", "acquisition-readiness", now.slice(0, 10).replace(/-/g, ""));
const manifestPath = process.env.NOEMA_DATA_ROOM_MANIFEST_PATH
  || join(outputDir, "data-room-manifest.json");

const entries = [
  file("product-readme", "product", "README.md"),
  file("api-spec", "product", "docs/api-spec.md"),
  file("api-stability-contract", "product", "docs/api-stability-contract.md"),
  file("demo-scenario", "product", "docs/demo-scenario.md"),
  file("buyer-pitch-outline", "product", "docs/buyer-pitch-deck-outline.md"),
  file("onboarding", "product", "docs/onboarding.md"),
  file("pricing", "commercial", "docs/pricing-draft.md"),
  file("terms", "commercial", "docs/terms-draft.md"),
  file("sla-support", "commercial", "docs/sla-and-support.md"),
  file("runbook", "operations", "docs/runbook.md"),
  file("deployment-guide", "operations", "docs/deployment-guide.md"),
  file("observability-kpi", "operations", "docs/observability-kpi.md"),
  file("security-checklist", "security", "docs/security-validation-checklist.md"),
  file("threat-model", "security", "docs/threat-model.md"),
  file("transfer-readiness-plan", "transfer", "docs/transfer-readiness-plan.md"),
  file("saleable-goal", "governance", "docs/saleable-program-goal-registry.md"),
  file("saleable-readiness", "governance", "docs/saleable-program-readiness.md"),
  file("acquisition-goal", "governance", "docs/acquisition-readiness-2b.md"),
  file("buyer-dd-index", "governance", "docs/buyer-due-diligence-index.md"),
  file("library-boundary", "governance", "docs/library-boundary-decision.md"),
  file("revenue-evidence-template", "commercial", "docs/evidence-templates/revenue-evidence.example.json"),
  file("transfer-evidence-template", "transfer", "docs/evidence-templates/transfer-evidence.example.json"),
  file("pilot-checklist", "pilot", "docs/pilot-readiness-checklist.md"),
  file("pilot-log", "pilot", "docs/pilot-readiness-log.md", {
    validatedBy: "npm run acquisition:audit",
    statusMeaning: "file presence only; production pilot content is validated by acquisition:audit",
  }),
  file("release-audit", "governance", "docs/release-readiness-audit.md"),
  file("goal-completion-audit", "governance", "docs/goal-completion-audit.md"),
  file("release-gate-script", "automation", "scripts/saleable-readiness-audit.mjs"),
  file("acquisition-gate-script", "automation", "scripts/acquisition-readiness-audit.mjs"),
  file("production-preflight-script", "automation", "scripts/production-evidence-preflight.mjs"),
  file("acquisition-scan-workflow", "automation", ".github/workflows/acquisition-readiness-scan.yml"),
  file("pilot-parser", "automation", "scripts/lib/pilot-readiness.mjs"),
  file("security-checklist-parser", "automation", "scripts/lib/security-checklist.mjs"),
  file("source-id-helper", "automation", "scripts/lib/source-id.mjs"),
  command("release-verify", "automation", "npm run release:verify"),
  command("readiness-audit", "automation", "npm run readiness:audit"),
  command("acquisition-audit", "automation", "npm run acquisition:audit"),
  external("figjam-value-map", "product", "https://www.figma.com/board/8l2fELfENAABNhDTMEVJKt"),
  finalEvidence("production-kpi-log", "operations", "exchange-30d.ndjson"),
  finalEvidence("production-kpi-provenance", "operations", "exchange-30d.ndjson.provenance.json"),
  finalEvidence("revenue-evidence", "commercial", "artifacts/acquisition/revenue-evidence.json"),
  finalEvidence("transfer-evidence", "transfer", "artifacts/acquisition/transfer-evidence.json"),
];

function file(id, category, path, extra = {}) {
  return { ...extra, id, category, kind: "file", path, required: true, requiredForFinalGate: true };
}

function command(id, category, commandText) {
  return { id, category, kind: "command", command: commandText, required: true, requiredForFinalGate: true };
}

function external(id, category, url) {
  return { id, category, kind: "external", url, required: true, requiredForFinalGate: true };
}

function finalEvidence(id, category, path, validatedBy = "npm run acquisition:audit") {
  return {
    id,
    category,
    kind: "file",
    path,
    required: false,
    requiredForFinalGate: true,
    validatedBy,
    statusMeaning: "file presence only; validator must pass before buyer use",
  };
}

function sha256(path) {
  const hash = createHash("sha256");
  const fd = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(fd, buffer, 0, buffer.length, null);
      if (bytesRead > 0) {
        hash.update(buffer.subarray(0, bytesRead));
      }
    } while (bytesRead > 0);
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

function materialize(entry) {
  if (entry.kind === "file") {
    const present = existsSync(entry.path);
    const stats = present ? statSync(entry.path) : null;
    return {
      ...entry,
      status: present ? "present" : "missing",
      bytes: stats?.size ?? null,
      sha256: present ? sha256(entry.path) : null,
    };
  }
  if (entry.kind === "external") {
    return {
      ...entry,
      status: typeof entry.url === "string" && entry.url.startsWith("https://") ? "present" : "missing",
    };
  }
  return {
    ...entry,
    status: typeof entry.command === "string" && entry.command.trim().length > 0 ? "present" : "missing",
  };
}

mkdirSync(outputDir, { recursive: true });
mkdirSync(dirname(manifestPath), { recursive: true });

const materializedEntries = entries.map(materialize);
const missingRequired = materializedEntries.filter((entry) => entry.required && entry.status !== "present");
const missingFinalGate = materializedEntries.filter((entry) => entry.requiredForFinalGate && entry.status !== "present");
const output = {
  generatedAt: now,
  objective: "NOEMA-GOAL-ACQUISITION-2B-2026-07-02",
  manifestPath,
  passed: missingRequired.length === 0,
  finalGatePassed: missingFinalGate.length === 0,
  missingRequired: missingRequired.map((entry) => entry.id),
  missingFinalGate: missingFinalGate.map((entry) => entry.id),
  entries: materializedEntries,
};

writeFileSync(manifestPath, JSON.stringify(output, null, 2));
console.log(`acquisition-data-room-manifest: ${output.passed ? "PASS" : "FAIL"}`);
console.log(`manifest_file=${manifestPath}`);
if (output.missingFinalGate.length > 0) {
  console.log("Missing final-gate evidence:");
  output.missingFinalGate.forEach((id) => console.log(`- ${id}`));
}
console.log("Final-gate validation: run npm run acquisition:audit after evidence files are present");

if (!output.passed) {
  process.exit(1);
}
