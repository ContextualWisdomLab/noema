import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  DurableWorkflowStateRepository,
  MAX_AUTOMATIC_RECOVERY_ATTEMPTS,
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
  async transaction<T>(callback: (txn: Storage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const key = "workflow-state:v1:exec-integrity-001:plan-integrity-001";
const admittedPlan = () => admitWorkflowTaskPlan({
  executionId: "exec-integrity-001",
  planId: "plan-integrity-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "only", dependsOn: [], effect: "pure" }],
});

const initialized = async () => {
  const storage = new Storage();
  const repository = new DurableWorkflowStateRepository(storage as unknown as DurableObjectStorage);
  const admitted = admittedPlan();
  await repository.initialize(admitted, {
    executionId: admitted.executionId,
    sequence: 0,
    stateDigest: "a".repeat(64),
  });
  return { storage, repository, admitted };
};

describe("Workflow durable-state integrity regressions", () => {
  it("rejects a stored checkpoint whose execution identity diverges from the workflow record", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = structuredClone(storage.records.get(key)) as {
      checkpoint: { executionId: string };
    };
    record.checkpoint.executionId = "exec-foreign-checkpoint";
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(
      /checkpoint execution identity.*workflow/i,
    );
  });

  it("rejects an impossible stored attempt count above the repository recovery ceiling", async () => {
    const { storage, repository, admitted } = await initialized();
    const record = structuredClone(storage.records.get(key)) as {
      tasks: Array<{ attempt: number }>;
    };
    record.tasks[0]!.attempt = MAX_AUTOMATIC_RECOVERY_ATTEMPTS + 1;
    storage.records.set(key, record);

    await expect(repository.readState(admitted)).rejects.toThrowError(WorkflowStateConflictError);
  });
});
