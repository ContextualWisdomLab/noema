import { describe, expect, it } from "vitest";

import {
  ExecutionLifecycleError,
  isTerminalExecutionState,
  transitionExecutionLifecycle,
  type ExecutionSignal,
  type ExecutionState,
} from "../src/agent-runtime/execution-lifecycle";

describe("Agent Runtime execution lifecycle", () => {
  it.each<[ExecutionState, ExecutionSignal, ExecutionState]>([
    ["accepted", "start", "running"],
    ["accepted", "request_cancellation", "cancellation_requested"],
    ["running", "request_cancellation", "cancellation_requested"],
    ["running", "complete_success", "succeeded"],
    ["running", "complete_failure", "failed"],
    ["cancellation_requested", "confirm_cancelled", "cancelled"],
  ])("transitions %s with %s to %s", (current, signal, expected) => {
    expect(transitionExecutionLifecycle(current, signal)).toBe(expected);
  });

  it.each<[ExecutionState, ExecutionSignal]>([
    ["running", "start"],
    ["cancellation_requested", "request_cancellation"],
    ["succeeded", "complete_success"],
    ["failed", "complete_failure"],
    ["cancelled", "confirm_cancelled"],
  ])("treats duplicate %s/%s delivery as an idempotent replay", (state, signal) => {
    expect(transitionExecutionLifecycle(state, signal)).toBe(state);
  });

  it.each<ExecutionState>(["succeeded", "failed", "cancelled"])("keeps terminal state %s terminal", (state) => {
    expect(isTerminalExecutionState(state)).toBe(true);
    expect(() => transitionExecutionLifecycle(state, "start")).toThrow(ExecutionLifecycleError);
  });

  it.each<ExecutionState>(["accepted", "running", "cancellation_requested"])(
    "recognizes non-terminal state %s",
    (state) => {
      expect(isTerminalExecutionState(state)).toBe(false);
    },
  );

  it("rejects completion that arrives after cancellation authority has been recorded", () => {
    expect(() => transitionExecutionLifecycle("cancellation_requested", "complete_success")).toThrowError(
      /invalid execution lifecycle transition: cancellation_requested -> complete_success/,
    );
    expect(() => transitionExecutionLifecycle("cancellation_requested", "complete_failure")).toThrowError(
      /invalid execution lifecycle transition: cancellation_requested -> complete_failure/,
    );
  });

  it("rejects completion before an accepted execution starts", () => {
    expect(() => transitionExecutionLifecycle("accepted", "complete_success")).toThrowError(ExecutionLifecycleError);
  });
});
