import { describe, expect, it } from "vitest";

import {
  NoemaWorkflowState,
  workflowStateObjectName,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import { MAX_AUTOMATIC_RECOVERY_ATTEMPTS } from "../src/workflow-task-execution/workflow-state-store";

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

const executionId = "exec-command-shape-001";
const plan: WorkflowTaskPlan = {
  executionId,
  planId: "plan-command-shape-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "publish", dependsOn: [], effect: "side_effecting" }],
};
const checkpoint = {
  executionId,
  sequence: 0,
  stateDigest: "a".repeat(64),
} as const;
const endpoint = "https://noema-workflow-state.internal/command";

async function createInitializedObject(): Promise<NoemaWorkflowState> {
  const name = await workflowStateObjectName(executionId);
  const object = new NoemaWorkflowState({
    id: { name } as DurableObjectId,
    storage: new TransactionalStorage(),
  } as unknown as DurableObjectState);
  const response = await object.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: "initialize", plan, checkpoint }),
  }));
  expect(response.status).toBe(200);
  return object;
}

async function command(object: NoemaWorkflowState, body: Record<string, unknown>): Promise<Response> {
  return object.fetch(new Request(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, plan }),
  }));
}

describe("Workflow state Durable Object command shape admission", () => {
  it("classifies malformed scalar command fields as invalid requests before state arbitration", async () => {
    const malformedCommands: readonly Record<string, unknown>[] = [
      { operation: "claim_next", claimId: 7 },
      { operation: "claim_runnable", taskId: 7, claimId: "claim-shape-valid" },
      { operation: "claim_runnable", taskId: "", claimId: "claim-shape-empty-task" },
      { operation: "claim_runnable", taskId: " ", claimId: "claim-shape-space-task" },
      { operation: "claim_runnable", taskId: "publish\n", claimId: "claim-shape-control-task" },
      { operation: "claim_runnable", taskId: "x".repeat(129), claimId: "claim-shape-long-task" },
      { operation: "claim_runnable", taskId: "publish", claimId: 7 },
      { operation: "request_cancellation", cancellationId: 7 },
    ];

    for (const malformed of malformedCommands) {
      const object = await createInitializedObject();
      const response = await command(object, malformed);
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ ok: false, error: "invalid_request" });
    }
  });

  it("classifies an impossible claim attempt as an invalid request before state arbitration", async () => {
    const object = await createInitializedObject();
    const claimed = await command(object, {
      operation: "claim_runnable",
      taskId: "publish",
      claimId: "claim-shape-attempt",
    });
    expect(claimed.status).toBe(200);
    const claim = (await claimed.json() as { data: Record<string, unknown> }).data;

    const response = await command(object, {
      operation: "mark_effect_started",
      claim: {
        ...claim,
        attempt: MAX_AUTOMATIC_RECOVERY_ATTEMPTS + 1,
      },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_request" });
  });

  it("classifies an unknown completion outcome as an invalid request", async () => {
    const object = await createInitializedObject();
    const claimed = await command(object, {
      operation: "claim_runnable",
      taskId: "publish",
      claimId: "claim-shape-complete",
    });
    expect(claimed.status).toBe(200);
    const claim = (await claimed.json() as { data: unknown }).data;

    const response = await command(object, {
      operation: "complete",
      claim,
      outcome: "unknown",
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid_request" });
  });
});