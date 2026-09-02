import { describe, expect, it } from "vitest";

import {
  ExecutionLifecycleError,
  isTerminalExecutionState,
  transitionExecutionLifecycle,
  type ExecutionLifecycle,
  type ExecutionSignal,
  type ExecutionSignalEnvelope,
  type ExecutionState,
} from "../src/agent-runtime/execution-lifecycle";

const lifecycle = (state: ExecutionState, executionId = "exec-01"): ExecutionLifecycle => ({
  executionId,
  state,
});

const envelope = (signal: ExecutionSignal, executionId = "exec-01"): ExecutionSignalEnvelope => ({
  executionId,
  signal,
});

describe("Agent Runtime execution lifecycle", () => {
  it.each<[ExecutionState, ExecutionSignal, ExecutionState]>([
    ["accepted", "start", "running"],
    ["accepted", "request_cancellation", "cancellation_requested"],
    ["running", "request_cancellation", "cancellation_requested"],
    ["running", "complete_success", "succeeded"],
    ["running", "complete_failure", "failed"],
    ["cancellation_requested", "confirm_cancelled", "cancelled"],
  ])("transitions %s with %s to %s for one execution identity", (current, signal, expected) => {
    expect(transitionExecutionLifecycle(lifecycle(current), envelope(signal))).toEqual(lifecycle(expected));
  });

  it.each<[ExecutionState, ExecutionSignal]>([
    ["running", "start"],
    ["cancellation_requested", "request_cancellation"],
    ["succeeded", "complete_success"],
    ["failed", "complete_failure"],
    ["cancelled", "confirm_cancelled"],
  ])("treats duplicate %s/%s delivery as an idempotent replay", (state, signal) => {
    expect(transitionExecutionLifecycle(lifecycle(state), envelope(signal))).toEqual(lifecycle(state));
  });

  it("rejects a signal carrying another execution identity before applying a transition", () => {
    expect(() => transitionExecutionLifecycle(lifecycle("accepted", "exec-01"), envelope("start", "exec-02"))).toThrowError(
      /execution identity mismatch/,
    );
  });

  it.each(["", " exec-01", "exec\n01", `exec-${"x".repeat(124)}`])(
    "rejects non-canonical lifecycle execution identity %j",
    (executionId) => {
      expect(() => transitionExecutionLifecycle(lifecycle("accepted", executionId), envelope("start", executionId))).toThrow(
        ExecutionLifecycleError,
      );
    },
  );

  it("returns a detached frozen lifecycle snapshot", () => {
    const current = { executionId: "exec-01", state: "accepted" as const };
    const signal = { executionId: "exec-01", signal: "start" as const };
    const next = transitionExecutionLifecycle(current, signal);

    current.executionId = "exec-mutated";
    signal.executionId = "exec-mutated";

    expect(next).toEqual(lifecycle("running"));
    expect(Object.isFrozen(next)).toBe(true);
  });

  it("normalizes null and hostile accessor inputs into the lifecycle domain error", () => {
    expect(() =>
      transitionExecutionLifecycle(
        null as unknown as ExecutionLifecycle,
        envelope("start"),
      ),
    ).toThrow(ExecutionLifecycleError);
    expect(() =>
      transitionExecutionLifecycle(
        lifecycle("accepted"),
        null as unknown as ExecutionSignalEnvelope,
      ),
    ).toThrow(ExecutionLifecycleError);

    const hostileLifecycle = Object.defineProperty({}, "executionId", {
      get: () => {
        throw new Error("hostile lifecycle accessor");
      },
    }) as ExecutionLifecycle;
    expect(() => transitionExecutionLifecycle(hostileLifecycle, envelope("start"))).toThrow(
      ExecutionLifecycleError,
    );

    const hostileSignal = Object.defineProperty({}, "signal", {
      get: () => {
        throw new Error("hostile signal accessor");
      },
    }) as ExecutionSignalEnvelope;
    expect(() => transitionExecutionLifecycle(lifecycle("accepted"), hostileSignal)).toThrow(
      ExecutionLifecycleError,
    );
  });

  it.each<ExecutionState>(["succeeded", "failed", "cancelled"])("keeps terminal state %s terminal", (state) => {
    expect(isTerminalExecutionState(state)).toBe(true);
    expect(() => transitionExecutionLifecycle(lifecycle(state), envelope("start"))).toThrow(ExecutionLifecycleError);
  });

  it.each<ExecutionState>(["accepted", "running", "cancellation_requested"])(
    "recognizes non-terminal state %s",
    (state) => {
      expect(isTerminalExecutionState(state)).toBe(false);
    },
  );

  it("rejects completion that arrives after cancellation authority has been recorded", () => {
    expect(() => transitionExecutionLifecycle(lifecycle("cancellation_requested"), envelope("complete_success"))).toThrowError(
      /invalid execution lifecycle transition: cancellation_requested -> complete_success/,
    );
    expect(() => transitionExecutionLifecycle(lifecycle("cancellation_requested"), envelope("complete_failure"))).toThrowError(
      /invalid execution lifecycle transition: cancellation_requested -> complete_failure/,
    );
  });

  it("rejects completion before an accepted execution starts", () => {
    expect(() => transitionExecutionLifecycle(lifecycle("accepted"), envelope("complete_success"))).toThrowError(
      ExecutionLifecycleError,
    );
  });
});
