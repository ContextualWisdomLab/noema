#!/usr/bin/env node
import {
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MAX_REPORT_BYTES = 1_048_576;
const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_REPORT_PATH = "artifacts/operations/commercial-readiness-loop-dry-run.json";
const MAX_RESULTS = 100;
const MAX_REASONS_PER_RESULT = 50;
const MAX_REASON_CODE_CHARS = 100;
const MAX_REASON_DETAIL_CHARS = 4_000;
const MAX_RESULT_DETAIL_CHARS = 1_000;
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const reasonCodePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const allowedResults = new Set([
  "blocked",
  "request_review",
  "merge",
  "review_in_progress",
  "review_dispatched",
  "merged",
  "operational_error",
]);
const allowedDecisions = new Set(["blocked", "request_review", "merge"]);

/** Return whether a parsed JSON value is a non-array object. */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Require a bounded string that cannot persist unsafe control characters. */
function boundedString(value, label, maximum) {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be a string.`);
  }
  if (value.length === 0 || value.length > maximum) {
    throw new RangeError(`${label} is outside its bounded length.`);
  }
  if (unsafeControlPattern.test(value)) {
    throw new TypeError(`${label} contains an unsafe control character.`);
  }
  return value;
}

/** Require a non-negative pull-request count or the explicit unknown value. */
function normalizedCount(value, label) {
  if (value === null) {
    return null;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be null or a non-negative safe integer.`);
  }
  return value;
}

/** Normalize one bounded fail-closed reason without retaining unknown fields. */
function normalizeReason(reason) {
  if (!isRecord(reason)) {
    throw new TypeError("Each commercial-readiness reason must be an object.");
  }
  const code = boundedString(reason.code, "reason code", MAX_REASON_CODE_CHARS);
  if (!reasonCodePattern.test(code)) {
    throw new TypeError("Commercial-readiness reason codes must use snake_case.");
  }
  return {
    code,
    detail: boundedString(reason.detail, "reason detail", MAX_REASON_DETAIL_CHARS),
  };
}

/** Normalize one pull-request result into the reviewed evidence schema. */
function normalizeResult(result) {
  if (!isRecord(result)) {
    throw new TypeError("Each commercial-readiness result must be an object.");
  }
  const number = result.number;
  if (number !== null && (!Number.isSafeInteger(number) || number <= 0)) {
    throw new TypeError("Result pull-request number must be null or a positive safe integer.");
  }
  const resultName = boundedString(result.result, "result", 100);
  if (!allowedResults.has(resultName)) {
    throw new TypeError(`Unsupported commercial-readiness result ${resultName}.`);
  }
  if (!Array.isArray(result.reasons) || result.reasons.length > MAX_REASONS_PER_RESULT) {
    throw new TypeError("Result reasons must be a bounded array.");
  }

  const normalized = { number };
  if (result.headSha !== undefined) {
    const headSha = boundedString(result.headSha, "head SHA", 40);
    if (!fullShaPattern.test(headSha)) {
      throw new TypeError("Result head SHA must be a full hexadecimal commit SHA.");
    }
    normalized.headSha = headSha.toLowerCase();
  }
  if (result.decision !== undefined) {
    const decision = boundedString(result.decision, "decision", 100);
    if (!allowedDecisions.has(decision)) {
      throw new TypeError(`Unsupported commercial-readiness decision ${decision}.`);
    }
    normalized.decision = decision;
  }
  normalized.result = resultName;
  normalized.reasons = result.reasons.map(normalizeReason);
  if (result.detail !== undefined) {
    normalized.detail = boundedString(
      result.detail,
      "result detail",
      MAX_RESULT_DETAIL_CHARS,
    );
  }
  return normalized;
}

/** Build a fixed report that cannot be mistaken for successful dry-run evidence. */
function invalidEvidenceReport(expectedRepository, now) {
  return {
    schemaVersion: 1,
    repository: expectedRepository,
    generatedAt: now().toISOString(),
    apply: false,
    openPullRequestCount: null,
    remainingOpenPullRequestCount: null,
    results: [
      {
        number: null,
        result: "operational_error",
        reasons: [
          {
            code: "dry_run_report_invalid",
            detail:
              "Dry-run evidence failed size, syntax, or schema validation and was replaced before artifact upload.",
          },
        ],
      },
    ],
  };
}

/** Serialize a report and enforce the same one-mebibyte persisted evidence cap. */
function serializeBounded(report) {
  const content = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > MAX_REPORT_BYTES) {
    throw new RangeError("Canonical commercial-readiness evidence exceeds one mebibyte.");
  }
  return content;
}

/**
 * Parse, validate, and canonicalize a no-write commercial-readiness report.
 * Invalid input is replaced with a fixed operational-error report and no
 * untrusted parser detail or source text is retained.
 */
export function normalizeCommercialReadinessEvidence(
  raw,
  {
    expectedRepository = EXPECTED_REPOSITORY,
    now = () => new Date(),
  } = {},
) {
  const fallback = () => {
    const report = invalidEvidenceReport(expectedRepository, now);
    return { valid: false, report, content: serializeBounded(report) };
  };

  try {
    if (!Buffer.isBuffer(raw) || raw.byteLength === 0 || raw.byteLength > MAX_REPORT_BYTES) {
      return fallback();
    }
    const parsed = JSON.parse(raw.toString("utf8"));
    if (!isRecord(parsed)) {
      return fallback();
    }
    if (parsed.schemaVersion !== 1) {
      return fallback();
    }
    if (parsed.repository !== expectedRepository) {
      return fallback();
    }
    if (parsed.apply !== false) {
      return fallback();
    }
    const generatedAt = boundedString(parsed.generatedAt, "generated timestamp", 64);
    const generatedAtMilliseconds = Date.parse(generatedAt);
    if (Number.isNaN(generatedAtMilliseconds)) {
      return fallback();
    }
    if (!Array.isArray(parsed.results) || parsed.results.length > MAX_RESULTS) {
      return fallback();
    }
    const report = {
      schemaVersion: 1,
      repository: expectedRepository,
      generatedAt: new Date(generatedAtMilliseconds).toISOString(),
      apply: false,
      openPullRequestCount: normalizedCount(
        parsed.openPullRequestCount,
        "openPullRequestCount",
      ),
      remainingOpenPullRequestCount: normalizedCount(
        parsed.remainingOpenPullRequestCount,
        "remainingOpenPullRequestCount",
      ),
      results: parsed.results.map(normalizeResult),
    };
    return { valid: true, report, content: serializeBounded(report) };
  } catch {
    return fallback();
  }
}

/** Read only a regular non-symlink file within the reviewed evidence budget. */
function readBoundedReport(path) {
  const metadata = lstatSync(path);
  if (
    !metadata.isFile()
    || metadata.isSymbolicLink()
    || !Number.isSafeInteger(metadata.size)
    || metadata.size <= 0
    || metadata.size > MAX_REPORT_BYTES
  ) {
    return null;
  }
  const raw = readFileSync(path);
  return raw.byteLength > 0 && raw.byteLength <= MAX_REPORT_BYTES ? raw : null;
}

/** Replace an evidence file atomically within its existing filesystem. */
function writeAtomically(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(temporaryPath, content, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

/** Normalize the workflow artifact in place and fail its gate on replacement. */
export function main() {
  const reportPath = resolve(
    String(process.env.REPORT_PATH ?? DEFAULT_REPORT_PATH).trim() || DEFAULT_REPORT_PATH,
  );
  let raw = null;
  try {
    raw = readBoundedReport(reportPath);
  } catch {
    raw = null;
  }
  const result = normalizeCommercialReadinessEvidence(raw, {
    expectedRepository: EXPECTED_REPOSITORY,
  });
  writeAtomically(reportPath, result.content);
  console.log(JSON.stringify({
    reportPath,
    valid: result.valid,
    resultCount: result.report.results.length,
  }));
  if (!result.valid) {
    process.exitCode = 1;
  }
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) {
  main();
}
