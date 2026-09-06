import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import { DurableWorkflowStateRepository } from "../src/workflow-task-execution/workflow-state-store";

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

type MutableWorkflowRecord = {
  transitionSequence: number;
  transitionReceipts: unknown[];
};

describe("Workflow retained transition provenance integrity", () => {
  it("rejects a positive transition sequence whose retained receipt suffix was deleted", async () => {
    const storage = new Storage();
    const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
    const admitted = admitWorkflowTaskPlan({
      executionId: "exec-retained-provenance-001",
      planId: "plan-retained-provenance-001",
      maxConcurrency: 1,
      tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
    });

    await repository.initialize(admitted, {
      executionId: admitted.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
    });

    const stateKey = [...storage.records.keys()].find((key) => key.startsWith("workflow-state:v1:"));
    expect(stateKey).toBeDefined();
    const record = structuredClone(storage.records.get(stateKey!)) as MutableWorkflowRecord;
    expect(record.transitionSequence).toBe(1);
    expect(record.transitionReceipts).toHaveLength(1);

    record.transitionReceipts = [];
    storage.records.set(stateKey!, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(/retained receipt count/i);
  });
});
