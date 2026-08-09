import { lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { readBoundedJson } from "./patch-validator-image-receipts.mjs";

export const MAX_DIAGNOSTIC_BYTES = 16 * 1024;

const DIAGNOSTIC_STATUSES = new Set(["passed", "failed", "blocked"]);
const REASON_CODE = /^[a-z][a-z0-9_]{0,63}$/;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;
const MAX_STDERR_EXCERPT_CHARACTERS = 2_048;
const MAX_REASON_CODES = 20;
const WORKFLOW_DIAGNOSTIC_NAME = "patch-validator-untrusted-diagnostic.json";
const RETAINED_DIAGNOSTIC_NAME = "smoke-diagnostic.json";

function isRecord(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}

function retainWorkflowDiagnostic(path, diagnostic) {
  const runnerTemp = String(process.env.RUNNER_TEMP ?? "").trim();
  if (!runnerTemp) {
    return;
  }

  const trustedRunnerTemp = resolve(runnerTemp);
  const expectedDiagnosticPath = join(trustedRunnerTemp, WORKFLOW_DIAGNOSTIC_NAME);
  if (resolve(path) !== expectedDiagnosticPath) {
    return;
  }

  const evidenceDirectory = join(trustedRunnerTemp, "patch-validator-evidence");
  mkdirSync(evidenceDirectory, { recursive: true, mode: 0o700 });
  const directoryStat = lstatSync(evidenceDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
    throw new Error("smoke diagnostic evidence directory is unsafe");
  }

  const evidencePath = join(evidenceDirectory, RETAINED_DIAGNOSTIC_NAME);
  writeFileSync(evidencePath, `${JSON.stringify(diagnostic, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
    flag: "wx",
  });
}

export function readPatchValidatorDiagnostic(path) {
  let value;
  try {
    value = readBoundedJson(path, MAX_DIAGNOSTIC_BYTES);
  } catch (error) {
    const detail = String(error);
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

  const diagnostic = {
    trusted: false,
    status: value.status,
    exit_code: value.exit_code,
    stderr_excerpt: value.stderr_excerpt
      .replace(CONTROL_CHARACTERS, "")
      .slice(0, MAX_STDERR_EXCERPT_CHARACTERS),
    reason_codes: [...value.reason_codes],
  };
  retainWorkflowDiagnostic(path, diagnostic);
  return diagnostic;
}
