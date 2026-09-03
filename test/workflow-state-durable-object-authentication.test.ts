import { describe, expect, it } from "vitest";

import {
  NoemaWorkflowState,
  routeWorkflowStateCommand,
  type WorkflowStateDurableObjectEnv,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { ExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

class TransactionalStorage {
  readonly records = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return structuredClone(this.records.get(key)) as T | undefined;
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.records.set(key, structuredClone(value));
  }

  async transaction<T>(callback: (txn: TransactionalStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

const authKey = "workflow-state-authentication-key-2026-09-03";

const plan: WorkflowTaskPlan = {
  executionId: "exec-auth-routing-001",
  planId: "plan-auth-routing-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
};

const checkpoint: ExecutionCheckpoint = {
  executionId: plan.executionId,
  sequence: 0,
  stateDigest: "a".repeat(64),
};

class FakeWorkflowNamespace {
  private readonly object = new NoemaWorkflowState(
    { storage: new TransactionalStorage() } as unknown as DurableObjectState,
    { NOEMA_WORKFLOW_STATE_AUTH_KEY: authKey },
  );

  idFromName(name: string): DurableObjectId {
    return { toString: () => name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => this.object.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }
}

function runtimeEnv(key = authKey): WorkflowStateDurableObjectEnv {
  return {
    NOEMA_WORKFLOW_STATE: new FakeWorkflowNamespace() as unknown as DurableObjectNamespace,
    NOEMA_WORKFLOW_STATE_AUTH_KEY: key,
  };
}

describe("Workflow state Durable Object caller authentication", () => {
  it("authenticates router-issued commands without sending the shared key", async () => {
    const response = await routeWorkflowStateCommand(runtimeEnv(), {
      operation: "initialize",
      plan,
      checkpoint,
    });

    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain(authKey);
  });

  it("rejects direct or forged internal HTTP commands before repository mutation", async () => {
    const object = new NoemaWorkflowState(
      { storage: new TransactionalStorage() } as unknown as DurableObjectState,
      { NOEMA_WORKFLOW_STATE_AUTH_KEY: authKey },
    );
    const endpoint = "https://noema-workflow-state.internal/command";
    const body = JSON.stringify({ operation: "initialize", plan, checkpoint });

    const missing = await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }));
    expect(missing.status).toBe(401);

    const forged = await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-noema-workflow-authorization": "0".repeat(64),
      },
      body,
    }));
    expect(forged.status).toBe(401);
  });

  it("fails closed before routing when the internal capability key is too short", async () => {
    await expect(routeWorkflowStateCommand(runtimeEnv("short"), {
      operation: "initialize",
      plan,
      checkpoint,
    })).rejects.toThrow(/authorization key/i);
  });
});
