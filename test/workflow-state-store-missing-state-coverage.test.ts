import { describe, expect, it } from "vitest";

import { admitWorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import {
  NoemaWorkflowState,
  workflowStateObjectName,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import {
  DurableWorkflowStateRepository,
  WorkflowStateConflictError,
  type WorkflowTaskClaim,
} from "../src/workflow-task-execution/workflow-state-store";

const digest = (character: string): string => character.repeat(64);

const admittedPlan = () => admitWorkflowTaskPlan({
  executionId: "exec-missing-state-coverage-001",
  planId: "plan-missing-state-coverage-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});

const checkpoint = (sequence = 0, character = "a") => ({
  executionId: "exec-missing-state-coverage-001",
  sequence,
  stateDigest: digest(character),
});

class TransactionalStorage {
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

  async transaction<T>(callback: (txn: TransactionalStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function retainedStateKey(storage: TransactionalStorage): string {
  const entry = [...storage.records.entries()].find(([, value]) => (
    value !== null
    && typeof value === "object"
    && "tasks" in value
  ));
  if (entry === undefined) throw new Error("initialized workflow state record is missing from the test fixture");
  return entry[0];
}

describe("Workflow state missing-record coverage", () => {
  it("fails closed for every operation when execution authority exists but state is absent", async () => {
    const plan = admittedPlan();
    const storage = new TransactionalStorage();
    const repository = new DurableWorkflowStateRepository(
      storage as unknown as DurableObjectStorage,
    );
    await repository.initialize(plan, checkpoint());
    storage.records.delete(retainedStateKey(storage));

    const claim: WorkflowTaskClaim = {
      executionId: plan.executionId,
      planId: plan.planId,
      taskId: "publish",
      claimId: "claim-missing-state-coverage",
      attempt: 1,
      effect: "side_effecting",
    };
    const operations: readonly (() => Promise<unknown>)[] = [
      () => repository.readState(plan),
      () => repository.claimNextRunnableTask(plan, "claim-next-missing-state"),
      () => repository.claimRunnableTask(plan, "publish", "claim-named-missing-state"),
      () => repository.markEffectStarted(plan, claim),
      () => repository.requestCancellation(plan, "cancel-missing-state"),
      () => repository.completeTask(plan, claim, "succeeded"),
      () => repository.recoverInterruptedTask(plan, claim),
      () => repository.resolveBlockedDescendants(plan),
      () => repository.commitCheckpoint(plan, checkpoint(), checkpoint(1, "b")),
    ];

    for (const operation of operations) {
      await expect(operation()).rejects.toThrowError(WorkflowStateConflictError);
    }
  });

  it("maps a repository storage outage to the private Durable Object 503 contract", async () => {
    const plan = admittedPlan();
    const objectName = await workflowStateObjectName(plan.executionId);
    const storage = {
      transaction: async () => {
        throw new Error("durable storage unavailable");
      },
    } as unknown as DurableObjectStorage;
    const object = new NoemaWorkflowState({
      id: { name: objectName } as DurableObjectId,
      storage,
    } as unknown as DurableObjectState);

    const response = await object.fetch(new Request(
      "https://noema-workflow-state.internal/command",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "initialize",
          plan,
          checkpoint: checkpoint(),
        }),
      },
    ));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "storage_unavailable" });
  });

  it("maps an unexpected repository fault to the private Durable Object 500 contract", async () => {
    const plan = admittedPlan();
    const objectName = await workflowStateObjectName(plan.executionId);
    const object = new NoemaWorkflowState({
      id: { name: objectName } as DurableObjectId,
      storage: new TransactionalStorage() as unknown as DurableObjectStorage,
    } as unknown as DurableObjectState);
    const faultInjectedObject = object as unknown as {
      repository: { readState: () => Promise<never> };
    };
    faultInjectedObject.repository.readState = async () => {
      throw new Error("unexpected repository fault");
    };

    const response = await object.fetch(new Request(
      "https://noema-workflow-state.internal/command",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "read", plan }),
      },
    ));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ ok: false, error: "internal_error" });
  });
});
