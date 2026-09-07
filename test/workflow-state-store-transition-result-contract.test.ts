import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
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

type MutableReceipt = {
  transitionType: string;
  resultingState: string | null;
};

type MutableRecord = {
  transitionReceipts: MutableReceipt[];
};

describe("workflow transition resulting-state contract", () => {
  it("rejects a task_claimed receipt that fabricates a succeeded result", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(
      storage as unknown as DurableObjectStorage,
    );
    const plan = admitWorkflowTaskPlan({
      executionId: "exec-transition-result-001",
      planId: "plan-transition-result-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
    });
    await repository.initialize(plan, {
      executionId: plan.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
    });
    await repository.claimRunnableTask(plan, "only", "claim-transition-result-001");

    const key = "workflow-state:v1:exec-transition-result-001:plan-transition-result-001";
    const record = structuredClone(storage.records.get(key)) as MutableRecord;
    const claimed = record.transitionReceipts.find(
      (receipt) => receipt.transitionType === "task_claimed",
    )!;
    claimed.resultingState = "succeeded";
    storage.records.set(key, record);

    await expect(repository.readState(plan)).rejects.toThrowError(WorkflowStateConflictError);
  });
});
