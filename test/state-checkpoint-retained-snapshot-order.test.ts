import { describe, expect, it } from "vitest";

import {
  admitExecutionCheckpoint,
  type ExecutionCheckpoint,
} from "../src/state-checkpoint/checkpoint-admission";

const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);

describe("State & Checkpoint retained-authority snapshot order", () => {
  it("captures retained checkpoint authority before candidate accessors can mutate it", () => {
    const retained: { executionId: string; sequence: number; stateDigest: string } = {
      executionId: "exec-checkpoint-snapshot-order",
      sequence: 0,
      stateDigest: DIGEST_A,
    };

    const candidate = Object.defineProperties({}, {
      executionId: {
        enumerable: true,
        get: () => {
          retained.sequence = 1;
          return "exec-checkpoint-snapshot-order";
        },
      },
      sequence: { enumerable: true, get: () => 2 },
      stateDigest: { enumerable: true, get: () => DIGEST_B },
    }) as ExecutionCheckpoint;

    expect(() => admitExecutionCheckpoint(retained, candidate)).toThrowError(/advance exactly once/i);
  });
});
