import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
  WorkflowStateStoreUnavailableError,
} from "../src/workflow-task-execution/workflow-state-store";

class Storage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
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

const executionId = "exec-plan-authority-001";
const authorityKey = `workflow-state-plan-authority:v1:${executionId}`;
const plan = admitWorkflowTaskPlan({
  executionId,
  planId: "plan-authority-a",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});
const differentPlan = admitWorkflowTaskPlan({
  executionId,
  planId: "plan-authority-b",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});
const checkpoint = {
  executionId,
  sequence: 0,
  stateDigest: "a".repeat(64),
} as const;

describe("Workflow execution plan authority", () => {
  it("classifies a malformed durable authority as a state conflict rather than a storage outage", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    await repository.initialize(plan, checkpoint);
    storage.records.set(authorityKey, null);

    try {
      await repository.readState(plan);
      throw new Error("expected malformed authority to fail closed");
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowStateConflictError);
      expect(error).not.toBeInstanceOf(WorkflowStateStoreUnavailableError);
    }
  });

  it("backfills the authority record only by reinitializing the exact retained plan", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const first = await repository.initialize(plan, checkpoint);
    storage.records.delete(authorityKey);

    await expect(repository.readState(plan)).rejects.toThrowError(/plan authority is missing/i);
    await expect(repository.initialize(plan, checkpoint)).resolves.toEqual(first);
    await expect(repository.readState(plan)).resolves.toEqual(first);
  });

  it("rejects a different plan when legacy retained state exists without authority", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    await repository.initialize(plan, checkpoint);
    storage.records.delete(authorityKey);

    await expect(repository.initialize(differentPlan, checkpoint)).rejects.toBeInstanceOf(
      WorkflowStateConflictError,
    );
    expect(storage.records.has(authorityKey)).toBe(false);
    expect(
      [...storage.records.keys()].filter((key) => key.startsWith(`workflow-state:v1:${executionId}:`)),
    ).toHaveLength(1);
  });
});
