#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { evaluateSecurityChecklistText, evaluateSecurityEvidence } from "./lib/security-checklist.mjs";

const generatedAt = new Date().toISOString();
const checklistPath = process.env.NOEMA_SECURITY_CHECKLIST_PATH || "docs/security-validation-checklist.md";
const evidencePath = process.env.NOEMA_SECURITY_EVIDENCE_PATH || "artifacts/security/security-validation-evidence.json";
const auditPath = process.env.NOEMA_SECURITY_AUDIT_PATH || join("artifacts", "security", "security-validation-audit.json");
const checks = [];

function record(name, pass, details = {}) {
  checks.push({ name, pass, details });
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

const checklist = readText(checklistPath);
if (!checklist.ok) {
  record("security validation checklist complete", false, checklist);
} else {
  const evaluation = evaluateSecurityChecklistText(checklist.text);
  record("security validation checklist complete", evaluation.passed, {
    path: checklistPath,
    total: evaluation.total,
    checked: evaluation.checked,
    unchecked: evaluation.unchecked,
  });
}

const evidence = readJson(evidencePath);
if (!evidence.ok) {
  record("security validation evidence present", false, evidence);
} else {
  const evaluation = evaluateSecurityEvidence(evidence.value);
  record("security validation evidence present", evaluation.passed, {
    path: evidencePath,
    failures: evaluation.failures,
    owner: evidence.value?.owner,
    updated_at: evidence.value?.updated_at,
    source_documents: evidence.value?.source_documents,
    validation_artifacts: evidence.value?.validation_artifacts,
  });
}

const failures = checks.filter((check) => !check.pass);
const output = {
  generatedAt,
  passed: failures.length === 0,
  checklistPath,
  evidencePath,
  checks,
};

mkdirSync(dirname(auditPath), { recursive: true });
writeFileSync(auditPath, JSON.stringify(output, null, 2));

console.log(`security-validation-evidence: ${output.passed ? "PASS" : "FAIL"}`);
console.log(`audit_file=${auditPath}`);

if (!output.passed) {
  console.log("Failed checks:");
  failures.forEach((check) => console.log(`- ${check.name}`));
  process.exit(1);
}
