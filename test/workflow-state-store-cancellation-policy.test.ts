import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  WORKFLOW_EXECUTION_POLICY_V1,
  WorkflowStateConflictError,
} from "../src/workflow-task-execution/workflow-state-store";

class SerialStorage {
  readonly records = new Map<string, unknown>();
  private tail = Promise.resolve();

  async get<T>(key: string): Promise<T | undefined> {
    return this.records.get(key) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async transaction<T>(callback: (txn: SerialStorage) => Promise<T>): Promise<T> {
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

const fixture = async () => {
  const storage = new SerialStorage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const admitted = admitWorkflowTaskPlan({
    executionId: "exec-cancel-policy-001",
    planId: "plan-cancel-policy-001",
    maxConcurrency: 1,
    tasks: [
      { taskId: "first", dependsOn: [], effect: "pure" },
      { taskId: "second", dependsOn: [], effect: "side_effecting" },
    ],
  });
  const initialized = await repository.initialize(admitted, {
    executionId: admitted.executionId,
    sequence: 0,
    stateDigest: "a".repeat(64),
  });
  return { storage, repository, admitted, initialized };
};

describe("Workflow execution cancellation and scheduling policy", () => {
  it("persists an explicit versioned admission-order policy instead of leaving fairness implicit", async () => {
    const { repository, admitted, initialized } = await fixture();

    expect(initialized.policy).toEqual(WORKFLOW_EXECUTION_POLICY_V1);
    expect(initialized.policy).toEqual({
      policyVersion: "workflow-execution-policy.v1",
      schedulingPolicy: "admission_order",
      maxAutomaticRecoveryAttempts: 3,
    });

    const first = await repository.claimNextRunnableTask(admitted, "claim-first");
    expect(first.taskId).toBe("first");
    await repository.recoverInterruptedTask(admitted, first);

    const firstAgain = await repository.claimNextRunnableTask(admitted, "claim-first-2");
    expect(firstAgain.taskId).toBe("first");
    await repository.recoverInterruptedTask(admitted, firstAgain);

    const firstLast = await repository.claimNextRunnableTask(admitted, "claim-first-3");
    await repository.recoverInterruptedTask(admitted, firstLast);

    const second = await repository.claimNextRunnableTask(admitted, "claim-second");
    expect(second.taskId).toBe("second");
  });

  it("atomically prevents new claims after execution cancellation while preserving an already-running claim", async () => {
    const { repository, admitted } = await fixture();
    const running = await repository.claimNextRunnableTask(admitted, "claim-running");

    const cancelled = await repository.requestCancellation(admitted, "cancel-001");
    expect(cancelled.cancellation).toEqual({
      requested: true,
      cancellationId: "cancel-001",
    });
    expect(cancelled.tasks.find(({ taskId }) => taskId === running.taskId)?.state).toBe("running");
    expect(cancelled.tasks.find(({ taskId }) => taskId === "second")?.state).toBe("cancelled");

    await expect(repository.claimNextRunnableTask(admitted, "claim-after-cancel")).rejects.toThrowError(
      /cancelled/i,
    );
  });

  it("makes cancellation idempotent only for the exact cancellation identity", async () => {
    const { repository, admitted } = await fixture();
    const first = await repository.requestCancellation(admitted, "cancel-stable");

    await expect(repository.requestCancellation(admitted, "cancel-stable")).resolves.toEqual(first);
    await expect(repository.requestCancellation(admitted, "cancel-conflict")).rejects.toThrowError(
      WorkflowStateConflictError,
    );
  });

  it("serializes a claim-versus-cancellation race into one authoritative state", async () => {
    const { repository, admitted } = await fixture();

    const [claimResult, cancelResult] = await Promise.allSettled([
      repository.claimNextRunnableTask(admitted, "claim-race"),
      repository.requestCancellation(admitted, "cancel-race"),
    ]);

    expect(cancelResult.status).toBe("fulfilled");
    const retained = await repository.readState(admitted);
    expect(retained.cancellation.requested).toBe(true);

    if (claimResult.status === "fulfilled") {
      expect(retained.tasks.find(({ taskId }) => taskId === claimResult.value.taskId)?.state).toBe("running");
    } else {
      expect(claimResult.reason).toBeInstanceOf(WorkflowStateConflictError);
      expect(retained.tasks.every(({ state }) => state !== "running")).toBe(true);
    }

    await expect(repository.claimNextRunnableTask(admitted, "claim-late")).rejects.toThrowError(/cancelled/i);
  });
});
