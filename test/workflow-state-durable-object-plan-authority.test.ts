import { describe, expect, it } from "vitest";

import {
  NoemaWorkflowState,
  routeWorkflowStateCommand,
  type WorkflowStateDurableObjectEnv,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

class TransactionalStorage {
  readonly records = new Map<string, unknown>();
  private tail = Promise.resolve();

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

class SingleObjectNamespace {
  private object: NoemaWorkflowState | undefined;

  idFromName(name: string): DurableObjectId {
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    this.object ??= new NoemaWorkflowState(
      { id, storage: new TransactionalStorage() } as unknown as DurableObjectState,
    );
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => this.object!.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }
}

const executionId = "exec-routed-plan-authority-001";
const plan = (planId: string): WorkflowTaskPlan => ({
  executionId,
  planId,
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
});
const checkpoint = {
  executionId,
  sequence: 0,
  stateDigest: "a".repeat(64),
} as const;

describe("Workflow state Durable Object execution plan authority", () => {
  it("routes one execution to one authority and rejects a second plan revision", async () => {
    const namespace = new SingleObjectNamespace();
    const env = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    const firstPlan = plan("plan-routed-a");
    const secondPlan = plan("plan-routed-b");

    expect((await routeWorkflowStateCommand(env, {
      operation: "initialize",
      plan: firstPlan,
      checkpoint,
    })).status).toBe(200);

    expect((await routeWorkflowStateCommand(env, {
      operation: "initialize",
      plan: secondPlan,
      checkpoint,
    })).status).toBe(409);

    expect((await routeWorkflowStateCommand(env, {
      operation: "claim_runnable",
      plan: secondPlan,
      taskId: "publish",
      claimId: "claim-routed-second-plan",
    })).status).toBe(409);

    expect((await routeWorkflowStateCommand(env, {
      operation: "read",
      plan: firstPlan,
    })).status).toBe(200);
  });
});