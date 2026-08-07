import { describe, expect, it, vi } from "vitest";

import {
  buildFailureDiagnostic,
  runEntrypoint,
} from "../patch-validator/entrypoint.mjs";

function failedResult(overrides = {}) {
  return {
    status: "failed",
    repository_full_name: "ContextualWisdomLab/noema",
    base_sha: "1".repeat(40),
    head_sha: "2".repeat(40),
    patch_sha256: "3".repeat(64),
    profile: "node_patch_verify",
    command_profile: "node_patch_verify_v1",
    validator_image_digest: `sha256:${"4".repeat(64)}`,
    exit_code: 2,
    duration_ms: 10,
    stdout_excerpt: "ignored output",
    stderr_excerpt: "typecheck failed",
    reason_codes: ["command_failed"],
    ...overrides,
  };
}

describe("patch-validator image entrypoint", () => {
  it("does not emit a diagnostic for successful validation", () => {
    const write = vi.fn();

    expect(
      runEntrypoint({
        runCliImpl: () => failedResult({ status: "passed", exit_code: 0 }),
        writeDiagnostic: write,
      }),
    ).toBe(0);
    expect(write).not.toHaveBeenCalled();
  });

  it("emits one bounded non-authoritative failure diagnostic", () => {
    const write = vi.fn();
    const result = failedResult();

    expect(
      runEntrypoint({
        runCliImpl: () => result,
        writeDiagnostic: write,
      }),
    ).toBe(2);
    expect(buildFailureDiagnostic(result)).toEqual({
      trusted: false,
      status: "failed",
      exit_code: 2,
      stderr_excerpt: "typecheck failed",
      reason_codes: ["command_failed"],
    });
    expect(write).toHaveBeenCalledWith(
      `${JSON.stringify(buildFailureDiagnostic(result))}\n`,
    );
    expect(write.mock.calls[0][0]).not.toContain("repository_full_name");
    expect(write.mock.calls[0][0]).not.toContain("validator_image_digest");
  });

  it("uses a fail-closed exit when a blocked result has no failing exit code", () => {
    const write = vi.fn();

    expect(
      runEntrypoint({
        runCliImpl: () => failedResult({ status: "blocked", exit_code: 0 }),
        writeDiagnostic: write,
      }),
    ).toBe(1);
    expect(write).toHaveBeenCalledOnce();
  });
});
