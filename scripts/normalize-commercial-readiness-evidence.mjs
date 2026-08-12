#!/usr/bin/env node
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
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

/** Maximum accepted and persisted commercial-readiness evidence size in bytes. */
export const MAX_REPORT_BYTES = 1_048_576;
const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_REPORT_PATH = "artifacts/operations/commercial-readiness-loop-dry-run.json";
const MAX_RESULTS = 1_000;
const MAX_REASONS_PER_RESULT = 100;
const MAX_REASON_CODE_CHARS = 100;
const MAX_REASON_DETAIL_CHARS = 4_000;
const MAX_RESULT_DETAIL_CHARS = 1_000;
const MAX_JSON_NESTING_DEPTH = 256;
const MAXIMUM_SIGNED_OPEN_FLAG = 0x7fff_ffff;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });
const unsafeControlPattern = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const fullShaPattern = /^[0-9a-f]{40}$/i;
const reasonCodePattern = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
const canonicalTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const primitivePattern = /(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/y;
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
const defaultReader = Object.freeze({
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
});

/** Return whether a parsed JSON value is a non-array object. */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Advance a scanner past the four whitespace characters permitted by JSON. */
function skipJsonWhitespace(text, state) {
  while (state.index < text.length) {
    const character = text[state.index];
    if (character !== " " && character !== "\t" && character !== "\n" && character !== "\r") {
      return;
    }
    state.index += 1;
  }
}

/** Decode one JSON string token while retaining its exact scanner boundary. */
function parseJsonStringToken(text, state) {
  const start = state.index;
  state.index += 1;
  let escaped = false;
  while (state.index < text.length) {
    const character = text[state.index];
    const code = text.charCodeAt(state.index);
    if (code < 0x20) {
      throw new SyntaxError("JSON strings cannot contain unescaped control characters.");
    }
    state.index += 1;
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return JSON.parse(text.slice(start, state.index));
    }
  }
  throw new SyntaxError("JSON string was not terminated.");
}

/** Consume one JSON number, boolean, or null literal without copying the remaining input. */
function parseJsonPrimitive(text, state) {
  primitivePattern.lastIndex = state.index;
  const match = primitivePattern.exec(text);
  if (!match) {
    throw new SyntaxError(`Unexpected JSON token at character ${state.index}.`);
  }
  state.index += match[0].length;
  return false;
}

/** Scan one JSON array and propagate duplicate-key evidence from nested objects. */
function parseJsonArray(text, state, depth) {
  state.index += 1;
  skipJsonWhitespace(text, state);
  if (text[state.index] === "]") {
    state.index += 1;
    return false;
  }
  let duplicate = false;
  while (true) {
    duplicate = parseJsonValue(text, state, depth) || duplicate;
    skipJsonWhitespace(text, state);
    if (text[state.index] === "]") {
      state.index += 1;
      return duplicate;
    }
    if (text[state.index] !== ",") {
      throw new SyntaxError(`Expected an array comma at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
  }
}

/** Scan one JSON object and compare fully decoded keys within that object only. */
function parseJsonObject(text, state, depth) {
  state.index += 1;
  skipJsonWhitespace(text, state);
  if (text[state.index] === "}") {
    state.index += 1;
    return false;
  }
  const keys = new Set();
  let duplicate = false;
  while (true) {
    if (text[state.index] !== '"') {
      throw new SyntaxError(`Expected an object key at character ${state.index}.`);
    }
    const key = parseJsonStringToken(text, state);
    if (keys.has(key)) {
      duplicate = true;
    }
    keys.add(key);
    skipJsonWhitespace(text, state);
    if (text[state.index] !== ":") {
      throw new SyntaxError(`Expected an object colon at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
    duplicate = parseJsonValue(text, state, depth) || duplicate;
    skipJsonWhitespace(text, state);
    if (text[state.index] === "}") {
      state.index += 1;
      return duplicate;
    }
    if (text[state.index] !== ",") {
      throw new SyntaxError(`Expected an object comma at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
  }
}

/** Scan one JSON value with a bounded recursive nesting depth. */
function parseJsonValue(text, state, depth) {
  if (depth > MAX_JSON_NESTING_DEPTH) {
    throw new RangeError("JSON evidence nesting exceeds the reviewed limit.");
  }
  skipJsonWhitespace(text, state);
  const character = text[state.index];
  if (character === "{") {
    return parseJsonObject(text, state, depth + 1);
  }
  if (character === "[") {
    return parseJsonArray(text, state, depth + 1);
  }
  if (character === '"') {
    parseJsonStringToken(text, state);
    return false;
  }
  return parseJsonPrimitive(text, state);
}

/**
 * Return whether valid JSON text contains a duplicate decoded key in any object.
 * Keys are compared after JSON escape decoding, so `repository` and
 * `reposit\\u006fry` are duplicates. Malformed or excessively nested JSON throws
 * and is converted to fixed fail-closed evidence by the public normalizer.
 */
export function hasDuplicateJsonObjectKeys(text) {
  if (typeof text !== "string") {
    throw new TypeError("JSON evidence must be supplied as text.");
  }
  const state = { index: 0 };
  skipJsonWhitespace(text, state);
  const duplicate = parseJsonValue(text, state, 0);
  skipJsonWhitespace(text, state);
  if (state.index !== text.length) {
    throw new SyntaxError(`Unexpected trailing JSON content at character ${state.index}.`);
  }
  return duplicate;
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
    if (!Buffer.isBuffer(raw)) {
      return fallback();
    }
    if (raw.byteLength === 0) {
      return fallback();
    }
    if (raw.byteLength > MAX_REPORT_BYTES) {
      return fallback();
    }
    const text = fatalUtf8Decoder.decode(raw);
    if (hasDuplicateJsonObjectKeys(text)) {
      return fallback();
    }
    const parsed = JSON.parse(text);
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
    if (!canonicalTimestampPattern.test(generatedAt)) {
      return fallback();
    }
    const generatedAtMilliseconds = Date.parse(generatedAt);
    if (Number.isNaN(generatedAtMilliseconds)) {
      return fallback();
    }
    if (new Date(generatedAtMilliseconds).toISOString() !== generatedAt) {
      return fallback();
    }
    if (!Array.isArray(parsed.results)) {
      return fallback();
    }
    if (parsed.results.length > MAX_RESULTS) {
      return fallback();
    }
    const report = {
      schemaVersion: 1,
      repository: expectedRepository,
      generatedAt,
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

/**
 * Return whether filesystem metadata proves a bounded regular file.
 * Symlinks, directories, empty files, oversized files, and malformed adapter
 * metadata are rejected before any file content is read.
 */
export function isBoundedRegularEvidence(metadata) {
  if (!metadata || typeof metadata !== "object") {
    return false;
  }
  if (typeof metadata.isSymbolicLink !== "function") {
    return false;
  }
  if (typeof metadata.isFile !== "function") {
    return false;
  }
  if (metadata.isSymbolicLink()) {
    return false;
  }
  if (!metadata.isFile()) {
    return false;
  }
  if (!Number.isSafeInteger(metadata.size)) {
    return false;
  }
  if (metadata.size <= 0) {
    return false;
  }
  if (metadata.size > MAX_REPORT_BYTES) {
    return false;
  }
  return true;
}

/** Return whether an open flag is safe to combine with JavaScript bitwise operators. */
function isSafeOpenFlag(value, { allowZero }) {
  return (
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= MAXIMUM_SIGNED_OPEN_FLAG &&
    (allowZero || value !== 0)
  );
}

/**
 * Read a report through a no-follow descriptor and refuse stale path metadata.
 * The descriptor inode, device, and byte count must match before and after the
 * read so in-place mutation cannot be accepted as stable retained evidence.
 */
export function readBoundedReport(path, fileSystem = defaultReader) {
  const pathMetadata = fileSystem.lstatSync(path);
  if (!isBoundedRegularEvidence(pathMetadata)) {
    return null;
  }
  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  const readOnly = fileSystem.constants?.O_RDONLY;
  if (!isSafeOpenFlag(noFollow, { allowZero: false })) {
    return null;
  }
  if (!isSafeOpenFlag(readOnly, { allowZero: true })) {
    return null;
  }
  const descriptor = fileSystem.openSync(path, readOnly | noFollow);
  try {
    const openedMetadata = fileSystem.fstatSync(descriptor);
    if (!isBoundedRegularEvidence(openedMetadata)) {
      return null;
    }
    if (openedMetadata.dev !== pathMetadata.dev) {
      return null;
    }
    if (openedMetadata.ino !== pathMetadata.ino) {
      return null;
    }
    if (openedMetadata.size !== pathMetadata.size) {
      return null;
    }
    const raw = fileSystem.readFileSync(descriptor);
    if (!Buffer.isBuffer(raw)) {
      return null;
    }
    if (raw.byteLength !== openedMetadata.size) {
      return null;
    }
    const finalMetadata = fileSystem.fstatSync(descriptor);
    if (!isBoundedRegularEvidence(finalMetadata)) {
      return null;
    }
    if (finalMetadata.dev !== openedMetadata.dev) {
      return null;
    }
    if (finalMetadata.ino !== openedMetadata.ino) {
      return null;
    }
    if (finalMetadata.size !== openedMetadata.size) {
      return null;
    }
    return raw;
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

/** Replace an evidence file atomically without opening a predictable path. */
export function writeAtomically(path, content) {
  const parentDirectory = dirname(path);
  mkdirSync(parentDirectory, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(parentDirectory, ".noema-evidence-"));
  const temporaryPath = join(temporaryDirectory, "report.json");
  try {
    writeFileSync(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

/** Resolve an operator-supplied report path, using the documented default when blank. */
export function resolveReportPath(value, currentDirectory = process.cwd()) {
  const candidate = String(value ?? DEFAULT_REPORT_PATH).trim();
  return resolve(currentDirectory, candidate || DEFAULT_REPORT_PATH);
}

/**
 * Normalize one workflow artifact in place and fail its process gate when the
 * source is missing, unsafe, malformed, or outside the reviewed schema.
 */
export function main({
  reportPath = resolveReportPath(process.env.REPORT_PATH),
  now = () => new Date(),
  readReport = readBoundedReport,
  writeReport = writeAtomically,
  log = (message) => console.log(message),
  setExitCode = (code) => {
    process.exitCode = code;
  },
} = {}) {
  let raw = null;
  try {
    raw = readReport(reportPath);
  } catch {
    raw = null;
  }
  const result = normalizeCommercialReadinessEvidence(raw, {
    expectedRepository: EXPECTED_REPOSITORY,
    now,
  });
  writeReport(reportPath, result.content);
  log(JSON.stringify({
    reportPath,
    valid: result.valid,
    resultCount: result.report.results.length,
  }));
  if (!result.valid) {
    setExitCode(1);
  }
  return result;
}

/** Run the command entrypoint only when this module is the process entry file. */
export function runAsCommand({
  argvPath = process.argv[1],
  moduleUrl = import.meta.url,
  execute = main,
} = {}) {
  if (!argvPath) {
    return false;
  }
  if (pathToFileURL(resolve(argvPath)).href !== moduleUrl) {
    return false;
  }
  execute();
  return true;
}

runAsCommand();