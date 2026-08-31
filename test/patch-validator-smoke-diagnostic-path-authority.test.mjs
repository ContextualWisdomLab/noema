import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, it } from "vitest";

import { readPatchValidatorDiagnostic } from "../scripts/lib/patch-validator-smoke-diagnostic.mjs";

it("does not retain an untrusted diagnostic outside the exact runner-temp path", () => {
  const temp = mkdtempSync(join(tmpdir(), "noema-patch-validator-diagnostic-path-"));
  const runnerTemp = join(temp, "runner-temp");
  const inputDirectory = join(temp, "untrusted-input");
  const diagnosticPath = join(inputDirectory, "patch-validator-untrusted-diagnostic.json");
  const previousRunnerTemp = process.env.RUNNER_TEMP;

  mkdirSync(runnerTemp);
  mkdirSync(inputDirectory);
  writeFileSync(
    diagnosticPath,
    `${JSON.stringify({
      status: "failed",
      exit_code: 7,
      stderr_excerpt: "sandbox rejected the candidate patch",
      reason_codes: ["sandbox_rejected"],
    })}\n`,
    "utf8",
  );
  process.env.RUNNER_TEMP = runnerTemp;

  try {
    expect(readPatchValidatorDiagnostic(diagnosticPath)).toEqual({
      trusted: false,
      status: "failed",
      exit_code: 7,
      stderr_excerpt: "sandbox rejected the candidate patch",
      reason_codes: ["sandbox_rejected"],
    });
    expect(existsSync(join(runnerTemp, "patch-validator-evidence"))).toBe(false);
  } finally {
    if (previousRunnerTemp === undefined) {
      delete process.env.RUNNER_TEMP;
    } else {
      process.env.RUNNER_TEMP = previousRunnerTemp;
    }
    rmSync(temp, { recursive: true, force: true });
  }
});
