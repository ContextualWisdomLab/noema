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
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const DEFAULT_EVIDENCE_PATH = "external-scheduler-evidence.json";
const DEFAULT_REPORT_PATH = "artifacts/operations/external-scheduler-evidence-audit.json";
const MAX_EVIDENCE_BYTES = 262_144;
const MAX_ERROR_CHARS = 800;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

const defaultReadIo = {
  openSync,
  fstatSync,
  readFileSync,
  closeSync,
};

const defaultWriteIo = {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  renameSync,
  rmSync,
};

/** Return the platform no-follow flag when present, otherwise zero. */
export function resolveNoFollowFlag(value) {
  return typeof value === "number" ? value : 0;
}

/** Remove controls and bound untrusted text before retaining it in a report. */
export function sanitizeReportText(value) {
  const rawText = value instanceof Error
    ? value.message
    : typeof value === "string"
      ? value
      : "";
  const text = rawText
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim();
  return text.length <= MAX_ERROR_CHARS
    ? text
    : `${text.slice(0, MAX_ERROR_CHARS - 1)}…`;
}

/** Read one regular, no-follow, size-bounded UTF-8 JSON evidence file. */
export function readExternalSchedulerEvidence(path, io = defaultReadIo) {
  const absolutePath = resolve(path);
  let descriptor;
  try {
    descriptor = io.openSync(
      absolutePath,
      constants.O_RDONLY | resolveNoFollowFlag(constants.O_NOFOLLOW),
    );
    const stats = io.fstatSync(descriptor);
    if (!stats.isFile()) {
      throw new Error("External scheduler evidence must be a regular file.");
    }
    if (stats.size <= 0 || stats.size > MAX_EVIDENCE_BYTES) {
      throw new Error(
        `External scheduler evidence must contain 1 through ${MAX_EVIDENCE_BYTES} bytes.`,
      );
    }
    const bytes = io.readFileSync(descriptor);
    if (bytes.byteLength !== stats.size) {
      throw new Error("External scheduler evidence changed while it was being read.");
    }
    const text = fatalUtf8Decoder.decode(bytes);
    if (hasDuplicateJsonObjectKeys(text)) {
      throw new Error(
        "External scheduler evidence contains duplicate decoded JSON object keys.",
      );
    }
    return JSON.parse(text);
  } finally {
    if (descriptor !== undefined) io.closeSync(descriptor);
  }
}

/** Atomically publish a private JSON report and always remove temporary state. */
export function writeAtomicJson(path, value, io = defaultWriteIo) {
  const absolutePath = resolve(path);
  const directory = dirname(absolutePath);
  io.mkdirSync(directory, { recursive: true });
  const temporaryDirectory = io.mkdtempSync(join(directory, ".scheduler-audit-"));
  const temporaryPath = join(temporaryDirectory, "report.json");
  try {
    io.writeFileSync(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600, flag: "wx" },
    );
    io.renameSync(temporaryPath, absolutePath);
  } finally {
    io.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  return absolutePath;
}

/** Resolve deterministic operator paths while preserving blank-env fail closure. */
export function resolveCliPaths(env, argv) {
  const rawEvidencePath = env.NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH !== undefined
    ? env.NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH
    : argv[2] ?? DEFAULT_EVIDENCE_PATH;
  const rawReportPath = env.NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH
    ?? DEFAULT_REPORT_PATH;
  return {
    evidencePath: String(rawEvidencePath).trim() || DEFAULT_EVIDENCE_PATH,
    reportPath: String(rawReportPath).trim() || DEFAULT_REPORT_PATH,
  };
}

/** Build a bounded collection-failure report without retaining raw evidence. */
export function createFailureReport(error, generatedAt) {
  return {
    schema_version: 1,
    source: "external-hourly-scheduler-evidence-audit",
    generated_at: generatedAt,
    repository_full_name: "ContextualWisdomLab/noema",
    status: "FAIL",
    checks: [],
    failures: [
      {
        code: "evidence_collection_failed",
        detail: sanitizeReportText(error),
      },
    ],
    limitations: [
      "Collection failure proves neither scheduler configuration nor repository execution.",
      "The report never retains raw evidence, credentials, hidden reasoning, vulnerability details, or provider secrets.",
    ],
  };
}

/** Build a bounded validation report while omitting untrusted identity values on failure. */
export function createValidationReport(evidence, evaluation, generatedAt) {
  const report = {
    schema_version: 1,
    source: "external-hourly-scheduler-evidence-audit",
    generated_at: generatedAt,
    repository_full_name: "ContextualWisdomLab/noema",
    status: evaluation.status,
    checks: evaluation.checks,
    failures: evaluation.failures,
    limitations: [
      "This report validates retained evidence bytes; it does not query, enable, disable, or modify the external scheduler.",
      "It does not create GitHub checks, formal reviews, governance, merge authority, release evidence, deployment evidence, or acquisition readiness.",
      "Provider-side task ownership, schedule activation, duplicate-task disablement, and execution receipts remain separately reviewed operational evidence under issue #96.",
    ],
  };
  if (evaluation.status !== "PASS") return report;
  return {
    ...report,
    scheduler_task_identity: sanitizeReportText(evidence.scheduler_task_identity),
    prompt_sha256: sanitizeReportText(evidence.prompt_sha256),
    protected_main_sha: sanitizeReportText(evidence.protected_main_sha),
    scheduled_at: sanitizeReportText(evidence.scheduled_at),
    started_at: sanitizeReportText(evidence.started_at),
  };
}

/** Validate one external scheduler evidence file and persist a bounded audit report. */
export function main(options = {}) {
  const env = options.env ?? process.env;
  const argv = options.argv ?? process.argv;
  const now = options.now ?? (() => new Date().toISOString());
  const readEvidence = options.readEvidence ?? readExternalSchedulerEvidence;
  const writeReport = options.writeReport ?? writeAtomicJson;
  const writeOutput = options.writeOutput ?? ((value) => process.stdout.write(value));
  const setExitCode = options.setExitCode ?? ((code) => {
    process.exitCode = code;
  });
  const { evidencePath, reportPath } = resolveCliPaths(env, argv);
  const generatedAt = now();

  let report;
  try {
    const evidence = readEvidence(evidencePath);
    const evaluation = evaluateExternalSchedulerEvidence(evidence);
    report = createValidationReport(evidence, evaluation, generatedAt);
  } catch (error) {
    report = createFailureReport(error, generatedAt);
  }

  const writtenPath = writeReport(reportPath, report);
  writeOutput(
    `${JSON.stringify({ status: report.status, report_path: writtenPath })}\n`,
  );
  if (report.status !== "PASS") setExitCode(1);
  return report;
}

/** Execute the CLI only when the imported module is the process entry point. */
export function runIfDirect(metaUrl, argv, execute) {
  if (!argv[1] || metaUrl !== pathToFileURL(argv[1]).href) return false;
  execute();
  return true;
}

runIfDirect(import.meta.url, process.argv, main);
