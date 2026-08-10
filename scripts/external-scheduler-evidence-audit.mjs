#!/usr/bin/env node
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { evaluateExternalSchedulerEvidence } from "./lib/external-scheduler-evidence-audit.mjs";

const DEFAULT_EVIDENCE_PATH = "external-scheduler-evidence.json";
const DEFAULT_REPORT_PATH = "artifacts/operations/external-scheduler-evidence-audit.json";
const MAX_EVIDENCE_BYTES = 262_144;
const MAX_ERROR_CHARS = 800;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

function boundedError(value) {
  const text = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text.length <= MAX_ERROR_CHARS
    ? text
    : `${text.slice(0, MAX_ERROR_CHARS - 1)}…`;
}

/** Read one regular, no-follow, size-bounded UTF-8 JSON evidence file. */
export function readExternalSchedulerEvidence(path) {
  const absolutePath = resolve(path);
  let descriptor;
  try {
    descriptor = openSync(
      absolutePath,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const stats = fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new Error("External scheduler evidence must be a regular file.");
    }
    if (stats.size <= 0 || stats.size > MAX_EVIDENCE_BYTES) {
      throw new Error(
        `External scheduler evidence must contain 1 through ${MAX_EVIDENCE_BYTES} bytes.`,
      );
    }
    const bytes = readFileSync(descriptor);
    if (bytes.byteLength !== stats.size) {
      throw new Error("External scheduler evidence changed while it was being read.");
    }
    const text = fatalUtf8Decoder.decode(bytes);
    return JSON.parse(text);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeAtomicJson(path, value) {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  mkdirSync(directory, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(directory, ".scheduler-audit-"));
  const temporaryPath = join(temporaryDirectory, "report.json");
  try {
    writeFileSync(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    renameSync(temporaryPath, absolutePath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  return absolutePath;
}

function failureReport(error) {
  return {
    schema_version: 1,
    source: "external-hourly-scheduler-evidence-audit",
    generated_at: new Date().toISOString(),
    repository_full_name: "ContextualWisdomLab/noema",
    status: "FAIL",
    checks: [],
    failures: [
      {
        code: "evidence_collection_failed",
        detail: boundedError(error?.message ?? error),
      },
    ],
    limitations: [
      "Collection failure proves neither scheduler configuration nor repository execution.",
      "The report never retains raw evidence, credentials, hidden reasoning, vulnerability details, or provider secrets.",
    ],
  };
}

function successOrValidationReport(evidence, evaluation) {
  return {
    schema_version: 1,
    source: "external-hourly-scheduler-evidence-audit",
    generated_at: new Date().toISOString(),
    repository_full_name: "ContextualWisdomLab/noema",
    scheduler_task_identity: boundedError(evidence.scheduler_task_identity),
    prompt_sha256: boundedError(evidence.prompt_sha256),
    protected_main_sha: boundedError(evidence.protected_main_sha),
    scheduled_at: boundedError(evidence.scheduled_at),
    started_at: boundedError(evidence.started_at),
    status: evaluation.status,
    checks: evaluation.checks,
    failures: evaluation.failures,
    limitations: [
      "This report validates retained evidence bytes; it does not query, enable, disable, or modify the external scheduler.",
      "It does not create GitHub checks, formal reviews, governance, merge authority, release evidence, deployment evidence, or acquisition readiness.",
      "Provider-side task ownership, schedule activation, duplicate-task disablement, and execution receipts remain separately reviewed operational evidence under issue #96.",
    ],
  };
}

/** Validate one external scheduler evidence file and persist a bounded audit report. */
export function main() {
  const evidencePath = String(
    process.env.NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH
      ?? process.argv[2]
      ?? DEFAULT_EVIDENCE_PATH,
  ).trim() || DEFAULT_EVIDENCE_PATH;
  const reportPath = String(
    process.env.NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH ?? DEFAULT_REPORT_PATH,
  ).trim() || DEFAULT_REPORT_PATH;

  let report;
  try {
    const evidence = readExternalSchedulerEvidence(evidencePath);
    const evaluation = evaluateExternalSchedulerEvidence(evidence);
    report = successOrValidationReport(evidence, evaluation);
  } catch (error) {
    report = failureReport(error);
  }

  const writtenPath = writeAtomicJson(reportPath, report);
  process.stdout.write(
    `${JSON.stringify({ status: report.status, report_path: writtenPath })}\n`,
  );
  if (report.status !== "PASS") process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
