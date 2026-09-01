import { describe, expect, it } from "vitest";

import {
  CheckpointAdmissionError,
  admitExecutionCheckpoint,
  type ExecutionCheckpoint,
} from "../src/state-checkpoint/checkpoint-admission";

const checkpoint = (overrides: Partial<ExecutionCheckpoint> = {}): ExecutionCheckpoint => ({
  executionId: "exec-01",
  sequence: 0,
  stateDigest: "a".repeat(64),
  ...overrides,
});

describe("State & Checkpoint admission", () => {
  it("accepts an initial checkpoint only at sequence zero", () => {
    expect(admitExecutionCheckpoint(null, checkpoint())).toEqual({
      kind: "accepted",
      checkpoint: checkpoint(),
    });
    expect(() => admitExecutionCheckpoint(null, checkpoint({ sequence: 1 }))).toThrow(CheckpointAdmissionError);
  });

  it("treats an exact replay as idempotent instead of creating new side-effect authority", () => {
    const current = checkpoint();
    expect(admitExecutionCheckpoint(current, checkpoint())).toEqual({
      kind: "replay",
      checkpoint: current,
    });
  });

  it("detaches and freezes accepted checkpoint state from caller-owned aliases", () => {
    const candidate = {
      executionId: "exec-01",
      sequence: 0,
      stateDigest: "a".repeat(64),
    };
    const admission = admitExecutionCheckpoint(null, candidate);

    candidate.executionId = "exec-mutated";
    candidate.sequence = 7;
    candidate.stateDigest = "b".repeat(64);

    expect(admission.checkpoint).toEqual(checkpoint());
    expect(Object.isFrozen(admission.checkpoint)).toBe(true);
  });

  it("detaches and freezes replay state from retained and candidate aliases", () => {
    const retained = {
      executionId: "exec-01",
      sequence: 0,
      stateDigest: "a".repeat(64),
    };
    const candidate = { ...retained };
    const admission = admitExecutionCheckpoint(retained, candidate);

    retained.stateDigest = "b".repeat(64);
    candidate.stateDigest = "c".repeat(64);

    expect(admission).toEqual({ kind: "replay", checkpoint: checkpoint() });
    expect(Object.isFrozen(admission.checkpoint)).toBe(true);
  });

  it("rejects a conflicting replay at the same sequence", () => {
    expect(() =>
      admitExecutionCheckpoint(checkpoint(), checkpoint({ stateDigest: "b".repeat(64) })),
    ).toThrowError(/checkpoint replay conflicts with retained state/);
  });

  it("accepts only the immediately next checkpoint for the same execution", () => {
    const current = checkpoint();
    expect(admitExecutionCheckpoint(current, checkpoint({ sequence: 1, stateDigest: "b".repeat(64) }))).toEqual({
      kind: "accepted",
      checkpoint: checkpoint({ sequence: 1, stateDigest: "b".repeat(64) }),
    });

    expect(() => admitExecutionCheckpoint(current, checkpoint({ sequence: 2 }))).toThrowError(
      /checkpoint sequence must advance exactly once/,
    );
    expect(() => admitExecutionCheckpoint(checkpoint({ sequence: 2 }), checkpoint({ sequence: 1 }))).toThrowError(
      /checkpoint sequence is stale/,
    );
  });

  it("rejects checkpoints from another execution identity", () => {
    expect(() => admitExecutionCheckpoint(checkpoint(), checkpoint({ executionId: "exec-02", sequence: 1 }))).toThrowError(
      /checkpoint execution identity changed/,
    );
  });

  it.each<ExecutionCheckpoint>([
    checkpoint({ executionId: "" }),
    checkpoint({ executionId: " exec-01" }),
    checkpoint({ executionId: "exec\n01" }),
    checkpoint({ executionId: `exec-${"x".repeat(124)}` }),
    checkpoint({ sequence: -1 }),
    checkpoint({ sequence: Number.MAX_SAFE_INTEGER + 1 }),
    checkpoint({ stateDigest: "A".repeat(64) }),
    checkpoint({ stateDigest: "abc" }),
  ])("rejects malformed checkpoint authority %#", (candidate) => {
    expect(() => admitExecutionCheckpoint(null, candidate)).toThrow(CheckpointAdmissionError);
  });
});
