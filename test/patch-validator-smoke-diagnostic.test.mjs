import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  MAX_DIAGNOSTIC_BYTES,
  readPatchValidatorDiagnostic,
} from "../scripts/lib/patch-validator-smoke-diagnostic.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-smoke-diagnostic-"));
  roots.push(root);
  return root;
}

function validDiagnostic() {
  return {
    status: "failed",
    exit_code: 2,
    stderr_excerpt: "typecheck failed",
    reason_codes: ["command_failed"],
  };
}

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe("patch-validator smoke diagnostics", () => {
  it("returns only bounded non-authoritative fields from the private result", () => {
    const root = temporaryRoot();
    const resultPath = join(root, "result.json");
    writeFileSync(
      resultPath,
      JSON.stringify({
        status: "failed",
        exit_code: 2,
        stderr_excerpt: "typecheck failed\nwith control\u0007",
        reason_codes: ["command_failed", "extra"],
        repository_full_name: "attacker/controlled",
        validator_image_digest: "sha256:" + "f".repeat(64),
      }),
    );

    expect(readPatchValidatorDiagnostic(resultPath)).toEqual({
      trusted: false,
      status: "failed",
      exit_code: 2,
      stderr_excerpt: "typecheck failed\nwith control",
      reason_codes: ["command_failed", "extra"],
    });
  });

  it("rejects missing, oversized, malformed, and non-file diagnostics", () => {
    const root = temporaryRoot();
    expect(() => readPatchValidatorDiagnostic(join(root, "missing.json"))).toThrow(
      /unavailable/,
    );

    const oversizedPath = join(root, "oversized.json");
    writeFileSync(oversizedPath, "x".repeat(MAX_DIAGNOSTIC_BYTES + 1));
    expect(() => readPatchValidatorDiagnostic(oversizedPath)).toThrow(/byte length/);

    const malformedPath = join(root, "malformed.json");
    writeFileSync(malformedPath, "{");
    expect(() => readPatchValidatorDiagnostic(malformedPath)).toThrow(/valid JSON/);

    const directoryPath = join(root, "directory.json");
    mkdirSync(directoryPath);
    expect(() => readPatchValidatorDiagnostic(directoryPath)).toThrow(/regular file/);
  });

  const invalidCases = [
    ["record", null],
    ["status", { ...validDiagnostic(), status: "unknown" }],
    ["exit code", { ...validDiagnostic(), exit_code: -1 }],
    ["exit code", { ...validDiagnostic(), exit_code: 256 }],
    ["stderr", { ...validDiagnostic(), stderr_excerpt: 4 }],
    ["reason codes", { ...validDiagnostic(), reason_codes: "command_failed" }],
    ["reason codes", { ...validDiagnostic(), reason_codes: ["bad reason"] }],
    [
      "reason codes",
      { ...validDiagnostic(), reason_codes: Array.from({ length: 21 }, () => "extra") },
    ],
  ];

  it.each(invalidCases)("rejects invalid diagnostic %s fields", (_label, value) => {
    const root = temporaryRoot();
    const resultPath = join(root, "invalid-fields.json");
    writeFileSync(resultPath, JSON.stringify(value));
    expect(() => readPatchValidatorDiagnostic(resultPath)).toThrow(
      /diagnostic fields/,
    );
  });
});
