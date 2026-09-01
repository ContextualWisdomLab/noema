import { describe, expect, it } from "vitest";

import { transitionExecutionLifecycle } from "../src/agent-runtime/execution-lifecycle";
import { isCanonicalExecutionId } from "../src/runtime-shared/execution-identity";
import { admitExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";

const digest = "a".repeat(64);

describe("runtime execution identity type safety", () => {
  it.each([123, true, ["exec-01"], { toString: () => "exec-01" }])(
    "rejects non-string execution identity %j instead of coercing it",
    (executionId) => {
      expect(isCanonicalExecutionId(executionId as unknown as string)).toBe(false);
    },
  );

  it("rejects a non-string lifecycle identity before transition authority is applied", () => {
    const executionId = ["exec-01"] as unknown as string;

    expect(() =>
      transitionExecutionLifecycle(
        { executionId, state: "accepted" },
        { executionId, signal: "start" },
      ),
    ).toThrow("execution identity is not canonical");
  });

  it("rejects a non-string checkpoint identity before state authority is admitted", () => {
    const executionId = { toString: () => "exec-01" } as unknown as string;

    expect(() =>
      admitExecutionCheckpoint(null, {
        executionId,
        sequence: 0,
        stateDigest: digest,
      }),
    ).toThrow("checkpoint execution identity is not canonical");
  });
});
