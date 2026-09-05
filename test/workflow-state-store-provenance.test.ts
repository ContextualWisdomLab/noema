import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  MAX_TRANSITION_RECEIPTS,
} from "../src/workflow-task-execution/workflow-state-store";

class Storage {
  readonly records = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.records.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }
  async list<T>(options: { prefix?: string; limit?: number } = {}): Promise<Map<string, T>> {
    const prefix = options.prefix ?? "";
    const limit = options.limit ?? Number.POSITIVE_INFINITY;
    return new Map(
      [...this.records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .sort(([left], [right]) => left.localeCompare(right))
        .slice(0, limit)
        .map(([key, value]) => [key, structuredClone(value) as T] as const),
    );
  }
  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

type TransitionReceipt = {
  transitionSequence: number;
  transitionType: string;
  taskId: string | null;
  claimId: string | null;
  attempt: number | null;
  cancellationId: string | null;
  resultingState: string | null;
  checkpointSequence: number;
  checkpointStateDigest: string;
};

type ProvenanceSnapshot = {
  transitionSequence: number;
  transitionReceipts: readonly TransitionReceipt[];
};

const digest0 = "a".repeat(64);
const digest1 = "b".repeat(64);

function provenance(snapshot: unknown): ProvenanceSnapshot {
  return snapshot as ProvenanceSnapshot;
}

function plan(): WorkflowTaskPlan {
  return {
    executionId: "exec-provenance-001",
    planId: "plan-provenance-001",
    maxConcurrency: 1,
    tasks: [
      { taskId: "root", dependsOn: [], effect: "pure" },
      { taskId: "child", dependsOn: ["root"], effect: "idempotent" },
    ],
  };
}

describe("Workflow state transition provenance", () => {
  it("rejects terminal completion before the exact claim records effect start", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan(plan());
    await repository.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest0,
    });
    const claim = await repository.claimRunnableTask(admitted, "root", "claim-before-effect-001");

    await expect(repository.completeTask(admitted, claim, "succeeded")).rejects.toThrowError(/effect.start/i);

    const retained = await repository.readState(admitted);
    expect(retained.tasks[0]).toMatchObject({
      taskId: "root",
      state: "running",
      activeClaimId: "claim-before-effect-001",
      effectStarted: false,
    });
    expect(retained.transitionReceipts.at(-1)?.transitionType).toBe("task_claimed");
  });

  it("distinguishes durable claim, effect start, completion, blocked descendants, and checkpoint authority", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan(plan());
    const initialCheckpoint = {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest0,
    };

    await repository.initialize(admitted, initialCheckpoint);
    const claim = await repository.claimRunnableTask(admitted, "root", "claim-root-001");
    await repository.markEffectStarted(admitted, claim);
    await repository.completeTask(admitted, claim, "failed");
    const committed = await repository.commitCheckpoint(admitted, initialCheckpoint, {
      executionId: admitted.executionId,
      sequence: 1,
      stateDigest: digest1,
    });

    const evidence = provenance(committed);
    expect(evidence.transitionSequence).toBe(6);
    expect(evidence.transitionReceipts).toEqual([
      {
        transitionSequence: 1,
        transitionType: "initialized",
        taskId: null,
        claimId: null,
        attempt: null,
        cancellationId: null,
        resultingState: null,
        checkpointSequence: 0,
        checkpointStateDigest: digest0,
      },
      {
        transitionSequence: 2,
        transitionType: "task_claimed",
        taskId: "root",
        claimId: "claim-root-001",
        attempt: 1,
        cancellationId: null,
        resultingState: "running",
        checkpointSequence: 0,
        checkpointStateDigest: digest0,
      },
      {
        transitionSequence: 3,
        transitionType: "effect_started",
        taskId: "root",
        claimId: "claim-root-001",
        attempt: 1,
        cancellationId: null,
        resultingState: "running",
        checkpointSequence: 0,
        checkpointStateDigest: digest0,
      },
      {
        transitionSequence: 4,
        transitionType: "task_completed",
        taskId: "root",
        claimId: "claim-root-001",
        attempt: 1,
        cancellationId: null,
        resultingState: "failed",
        checkpointSequence: 0,
        checkpointStateDigest: digest0,
      },
      {
        transitionSequence: 5,
        transitionType: "task_blocked",
        taskId: "child",
        claimId: null,
        attempt: 0,
        cancellationId: null,
        resultingState: "blocked",
        checkpointSequence: 0,
        checkpointStateDigest: digest0,
      },
      {
        transitionSequence: 6,
        transitionType: "checkpoint_committed",
        taskId: null,
        claimId: null,
        attempt: null,
        cancellationId: null,
        resultingState: null,
        checkpointSequence: 1,
        checkpointStateDigest: digest1,
      },
    ]);

    for (const receipt of evidence.transitionReceipts) {
      expect(Object.keys(receipt).sort()).toEqual([
        "attempt",
        "cancellationId",
        "checkpointSequence",
        "checkpointStateDigest",
        "claimId",
        "resultingState",
        "taskId",
        "transitionSequence",
        "transitionType",
      ]);
    }
  });

  it("keeps cancellation provenance bounded while preserving the monotonic sequence after truncation", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-provenance-bounded-001",
      planId: "plan-provenance-bounded-001",
      maxConcurrency: 1,
      tasks: Array.from({ length: MAX_TRANSITION_RECEIPTS + 12 }, (_, index) => ({
        taskId: `task-${index + 1}`,
        dependsOn: [],
        effect: "pure" as const,
      })),
    });

    await repository.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: digest0,
    });
    const cancelled = await repository.requestCancellation(admitted, "cancel-all-001");
    const evidence = provenance(cancelled);

    expect(evidence.transitionSequence).toBe(MAX_TRANSITION_RECEIPTS + 14);
    expect(evidence.transitionReceipts).toHaveLength(MAX_TRANSITION_RECEIPTS);
    expect(evidence.transitionReceipts[0]?.transitionSequence).toBe(15);
    expect(evidence.transitionReceipts.at(-1)).toMatchObject({
      transitionSequence: MAX_TRANSITION_RECEIPTS + 14,
      transitionType: "task_cancelled",
      taskId: `task-${MAX_TRANSITION_RECEIPTS + 12}`,
      cancellationId: "cancel-all-001",
      resultingState: "cancelled",
    });
  });
});
