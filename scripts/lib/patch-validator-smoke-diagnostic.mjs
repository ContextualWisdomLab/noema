import { readBoundedJson } from "./patch-validator-image-receipts.mjs";

export const MAX_DIAGNOSTIC_BYTES = 16 * 1024;

const DIAGNOSTIC_STATUSES = new Set(["passed", "failed", "blocked"]);
const REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MAX_STDERR_EXCERPT_CHARACTERS = 2_048;
const MAX_REASON_CODES = 20;

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

export function readPatchValidatorDiagnostic(path) {
  let value;
  try {
    value = readBoundedJson(path, MAX_DIAGNOSTIC_BYTES);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`smoke diagnostic is unavailable or unsafe: ${detail}`, {
      cause: error,
    });
  }

  if (!isRecord(value)) {
    throw new Error("smoke diagnostic fields are invalid");
  }
  if (!DIAGNOSTIC_STATUSES.has(value.status)) {
    throw new Error("smoke diagnostic fields are invalid");
  }
  if (
    !Number.isInteger(value.exit_code) ||
    value.exit_code < 0 ||
    value.exit_code > 255
  ) {
    throw new Error("smoke diagnostic fields are invalid");
  }
  if (typeof value.stderr_excerpt !== "string") {
    throw new Error("smoke diagnostic fields are invalid");
  }
  if (
    !Array.isArray(value.reason_codes) ||
    value.reason_codes.length > MAX_REASON_CODES ||
    !value.reason_codes.every(
      (reasonCode) =>
        typeof reasonCode === "string" && REASON_CODE.test(reasonCode),
    )
  ) {
    throw new Error("smoke diagnostic fields are invalid");
  }

  return {
    trusted: false,
    status: value.status,
    exit_code: value.exit_code,
    stderr_excerpt: value.stderr_excerpt
      .replace(CONTROL_CHARACTERS, "")
      .slice(0, MAX_STDERR_EXCERPT_CHARACTERS),
    reason_codes: [...value.reason_codes],
  };
}
