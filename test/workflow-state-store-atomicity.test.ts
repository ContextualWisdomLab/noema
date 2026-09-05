import { describe, expect, it } from "vitest";

import { admitExecutionCheckpoint, type ExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";
import { admitWorkflowTaskPlan, type WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
  type WorkflowTaskClaim,
} from "../src/workflow-task-execution/workflow-state-store";

class TransactionalStorage {
  readonly records = new Map<string, unknown>();
  private tail = Promise.resolve();

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

  async transaction<T>(callback: (txn: TransactionalStorage) => Promise<T>): Promise<T> {
    const previous = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await callback(this);
    } finally {
      release();
    }
  }
}

const digest = (character: string): string => character.repeat(64);

const plan = (): WorkflowTaskPlan => ({
  executionId: "exec-state-store-001",
  planId: "plan-state-store-001",
  maxConcurrency: 2,
  tasks: [
    { taskId: "prepare", dependsOn: [], effect: "pure" },
    { taskId: "observe", dependsOn: ["prepare"], effect: "idempotent" },
    { taskId: "publish", dependsOn: ["prepare"], effect: "side_effecting" },
  ],
});

const initialCheckpoint = (): ExecutionCheckpoint => ({
  executionId: "exec-state-store-001",
  sequence: 0,
  stateDigest: digest("a"),
});

const repository = () => {
  const storage = new TransactionalStorage();
  return {
    storage,
    repository: new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage),
  };
};

describe("Workflow / Task Execution durable state repository", () => {
  it("initializes one admitted plan with an immutable state snapshot", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();

    const snapshot = await stateRepository.initialize(admitted, initialCheckpoint());

    expect(snapshot.executionId).toBe(admitted.executionId);
    expect(snapshot.planId).toBe(admitted.planId);
    expect(snapshot.checkpoint).toEqual(initialCheckpoint());
    expect(snapshot.tasks.map(({ taskId, state }) => [taskId, state])).toEqual([
      ["prepare", "pending"],
      ["observe", "pending"],
      ["publish", "pending"],
    ]);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.tasks)).toBe(true);
  });

  it("atomically grants at most one concurrent claim for the same side-effecting task", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();
    await stateRepository.initialize(admitted, initialCheckpoint());

    const prepare = await stateRepository.claimRunnableTask(admitted, "prepare", "claim-prepare-before-race");
    await stateRepository.markEffectStarted(admitted, prepare);
    await stateRepository.completeTask(admitted, prepare, "succeeded");

    const attempts = await Promise.allSettled([
      stateRepository.claimRunnableTask(admitted, "publish", "claim-publish-a"),
      stateRepository.claimRunnableTask(admitted, "publish", "claim-publish-b"),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    expect(rejected).toMatchObject({ status: "rejected" });
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(WorkflowStateConflictError);
    }

    const retained = await stateRepository.readState(admitted);
    expect(retained.tasks.find(({ taskId }) => taskId === "publish")?.state).toBe("running");
    expect(retained.tasks.find(({ taskId }) => taskId === "publish")?.attempt).toBe(1);
  });

  it("rechecks dependency state inside the same claim transaction", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();
    await stateRepository.initialize(admitted, initialCheckpoint());

    await expect(
      stateRepository.claimRunnableTask(admitted, "publish", "claim-publish-early"),
    ).rejects.toThrowError(WorkflowStateConflictError);

    const prepareClaim = await stateRepository.claimRunnableTask(
      admitted,
      "prepare",
      "claim-prepare",
    );
    await stateRepository.markEffectStarted(admitted, prepareClaim);
    await stateRepository.completeTask(admitted, prepareClaim, "succeeded");

    const publishClaim = await stateRepository.claimRunnableTask(
      admitted,
      "publish",
      "claim-publish",
    );
    expect(publishClaim).toMatchObject({
      executionId: admitted.executionId,
      planId: admitted.planId,
      taskId: "publish",
      claimId: "claim-publish",
      attempt: 1,
    });
  });

  it("commits checkpoints with compare-and-swap so divergent successors cannot both win", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();
    const initial = initialCheckpoint();
    await stateRepository.initialize(admitted, initial);

    const left = { executionId: admitted.executionId, sequence: 1, stateDigest: digest("b") };
    const right = { executionId: admitted.executionId, sequence: 1, stateDigest: digest("c") };
    expect(admitExecutionCheckpoint(initial, left).kind).toBe("accepted");
    expect(admitExecutionCheckpoint(initial, right).kind).toBe("accepted");

    const attempts = await Promise.allSettled([
      stateRepository.commitCheckpoint(admitted, initial, left),
      stateRepository.commitCheckpoint(admitted, initial, right),
    ]);

    expect(attempts.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    const rejected = attempts.find(({ status }) => status === "rejected");
    if (rejected?.status === "rejected") {
      expect(rejected.reason).toBeInstanceOf(WorkflowStateConflictError);
    }
    const retained = await stateRepository.readState(admitted);
    expect([left.stateDigest, right.stateDigest]).toContain(retained.checkpoint.stateDigest);
    expect(retained.checkpoint.sequence).toBe(1);
  });

  it("treats a checkpoint replay as an idempotent no-op that does not advance provenance", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();
    const initial = initialCheckpoint();
    await stateRepository.initialize(admitted, initial);

    const next = { executionId: admitted.executionId, sequence: 1, stateDigest: digest("b") };
    const committed = await stateRepository.commitCheckpoint(admitted, initial, next);

    const replayed = await stateRepository.commitCheckpoint(admitted, next, next);

    expect(replayed.checkpoint).toEqual(committed.checkpoint);
    expect(replayed.transitionSequence).toBe(committed.transitionSequence);
    expect(replayed.transitionReceipts).toEqual(committed.transitionReceipts);
    expect(
      replayed.transitionReceipts.filter(({ transitionType }) => transitionType === "checkpoint_committed"),
    ).toHaveLength(1);
  });

  it("requeues only a provably unstarted side effect and refuses replay after effect start", async () => {
    const admitted = admitWorkflowTaskPlan(plan());
    const { repository: stateRepository } = repository();
    await stateRepository.initialize(admitted, initialCheckpoint());

    const prepareClaim = await stateRepository.claimRunnableTask(admitted, "prepare", "claim-prepare");
    await stateRepository.recoverInterruptedTask(admitted, prepareClaim);
    expect((await stateRepository.readState(admitted)).tasks.find(({ taskId }) => taskId === "prepare")?.state).toBe("pending");

    const retryPrepare = await stateRepository.claimRunnableTask(admitted, "prepare", "claim-prepare-2");
    await stateRepository.markEffectStarted(admitted, retryPrepare);
    await stateRepository.completeTask(admitted, retryPrepare, "succeeded");

    const unstartedPublish: WorkflowTaskClaim = await stateRepository.claimRunnableTask(
      admitted,
      "publish",
      "claim-publish-unstarted",
    );
    const recovered = await stateRepository.recoverInterruptedTask(admitted, unstartedPublish);
    expect(recovered.tasks.find(({ taskId }) => taskId === "publish")?.state).toBe("pending");
    expect(recovered.tasks.find(({ taskId }) => taskId === "publish")?.effectStarted).toBe(false);

    const startedPublish = await stateRepository.claimRunnableTask(
      admitted,
      "publish",
      "claim-publish-started",
    );
    await stateRepository.markEffectStarted(admitted, startedPublish);

    await expect(stateRepository.recoverInterruptedTask(admitted, startedPublish)).rejects.toThrowError(
      /effect-started side-effecting task/i,
    );
    expect((await stateRepository.readState(admitted)).tasks.find(({ taskId }) => taskId === "publish")?.state).toBe("running");
  });
});
