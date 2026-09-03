import { describe, expect, it } from "vitest";

import {
  transitionExecutionLifecycle,
  type ExecutionSignal,
  type ExecutionState,
} from "../src/agent-runtime/execution-lifecycle";
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

  it("rejects a non-string lifecycle state instead of coercing it to a transition key", () => {
    const state = { toString: () => "accepted" } as unknown as ExecutionState;

    expect(() =>
      transitionExecutionLifecycle(
        { executionId: "exec-01", state },
        { executionId: "exec-01", signal: "start" },
      ),
    ).toThrow("execution lifecycle state is not canonical");
  });

  it("rejects a non-string lifecycle signal instead of coercing it to a transition key", () => {
    const signal = ["start"] as unknown as ExecutionSignal;

    expect(() =>
      transitionExecutionLifecycle(
        { executionId: "exec-01", state: "accepted" },
        { executionId: "exec-01", signal },
      ),
    ).toThrow("execution signal is not canonical");
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

  it("rejects a non-string checkpoint digest instead of coercing it", () => {
    const stateDigest = { toString: () => digest } as unknown as string;

    expect(() =>
      admitExecutionCheckpoint(null, {
        executionId: "exec-01",
        sequence: 0,
        stateDigest,
      }),
    ).toThrow("checkpoint state digest must be lowercase SHA-256");
  });
});