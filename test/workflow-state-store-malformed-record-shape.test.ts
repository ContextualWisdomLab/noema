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

const executionId = "exec-malformed-record-001";
const planId = "plan-malformed-record-001";
const stateKey = `workflow-state:v1:${executionId}:${planId}`;

const admittedPlan = () => admitWorkflowTaskPlan({
  executionId,
  planId,
  maxConcurrency: 1,
  tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
});

const initialized = async () => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const plan = admittedPlan();
  await repository.initialize(plan, {
    executionId,
    sequence: 0,
    stateDigest: "a".repeat(64),
  });
  return { storage, repository, plan };
};

type Corruption = readonly [
  label: string,
  corrupt: (storage: Storage) => void,
];

function mutateRecord(storage: Storage, mutate: (record: Record<string, unknown>) => void): void {
  const record = structuredClone(storage.records.get(stateKey)) as Record<string, unknown>;
  mutate(record);
  storage.records.set(stateKey, record);
}

const malformedRecordCases: readonly Corruption[] = [
  ["null root record", (storage) => storage.records.set(stateKey, null)],
  ["null task vector", (storage) => mutateRecord(storage, (record) => { record.tasks = null; })],
  ["null task entry", (storage) => mutateRecord(storage, (record) => {
    const tasks = structuredClone(record.tasks) as unknown[];
    tasks[0] = null;
    record.tasks = tasks;
  })],
  ["null checkpoint", (storage) => mutateRecord(storage, (record) => { record.checkpoint = null; })],
  ["null transition receipt", (storage) => mutateRecord(storage, (record) => {
    const receipts = structuredClone(record.transitionReceipts) as unknown[];
    receipts[0] = null;
    record.transitionReceipts = receipts;
  })],
];

describe("Workflow durable-state malformed record classification", () => {
  it.each(malformedRecordCases)("treats %s as durable-state conflict instead of storage outage", async (_label, corrupt) => {
    const { storage, repository, plan } = await initialized();
    corrupt(storage);

    await expect(repository.readState(plan)).rejects.toThrowError(WorkflowStateConflictError);
  });
});
