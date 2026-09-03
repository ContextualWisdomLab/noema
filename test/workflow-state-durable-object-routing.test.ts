import { describe, expect, it } from "vitest";

import {
  NoemaWorkflowState,
  routeWorkflowStateCommand,
  workflowStateObjectName,
  type WorkflowStateDurableObjectEnv,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { ExecutionCheckpoint } from "../src/state-checkpoint/checkpoint-admission";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";
import type { WorkflowTaskClaim } from "../src/workflow-task-execution/workflow-state-store";

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

class ThrowingStorage extends TransactionalStorage {
  override async transaction<T>(_callback: (txn: TransactionalStorage) => Promise<T>): Promise<T> {
    throw new Error("durable storage unavailable");
  }
}

class FakeWorkflowNamespace {
  readonly objects = new Map<string, NoemaWorkflowState>();
  readonly objectNames: string[] = [];

  idFromName(name: string): DurableObjectId {
    this.objectNames.push(name);
    return { toString: () => name } as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const name = id.toString();
    let object = this.objects.get(name);
    if (!object) {
      object = new NoemaWorkflowState({ storage: new TransactionalStorage() } as unknown as DurableObjectState);
      this.objects.set(name, object);
    }
    return {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => object!.fetch(new Request(input, init)),
    } as unknown as DurableObjectStub;
  }
}

const digest = (character: string): string => character.repeat(64);

const plan = (executionId = "exec-durable-routing-001"): WorkflowTaskPlan => ({
  executionId,
  planId: "plan-durable-routing-001",
  maxConcurrency: 1,
  tasks: [
    { taskId: "publish", dependsOn: [], effect: "side_effecting" },
  ],
});

const initialCheckpoint = (executionId = "exec-durable-routing-001"): ExecutionCheckpoint => ({
  executionId,
  sequence: 0,
  stateDigest: digest("a"),
});

const env = (namespace = new FakeWorkflowNamespace()) => ({
  namespace,
  env: { NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace } satisfies WorkflowStateDurableObjectEnv,
});

async function responseData<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Workflow state Durable Object production routing", () => {
  it("routes one execution to one object so concurrent side-effect claims have one winner", async () => {
    const { namespace, env: runtimeEnv } = env();
    const candidatePlan = plan();
    const initialized = await routeWorkflowStateCommand(runtimeEnv, {
      operation: "initialize",
      plan: candidatePlan,
      checkpoint: initialCheckpoint(),
    });
    expect(initialized.status).toBe(200);

    const attempts = await Promise.all([
      routeWorkflowStateCommand(runtimeEnv, {
        operation: "claim_runnable",
        plan: candidatePlan,
        taskId: "publish",
        claimId: "claim-routing-a",
      }),
      routeWorkflowStateCommand(runtimeEnv, {
        operation: "claim_runnable",
        plan: candidatePlan,
        taskId: "publish",
        claimId: "claim-routing-b",
      }),
    ]);

    expect(attempts.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(new Set(namespace.objectNames).size).toBe(1);
    expect(namespace.objects.size).toBe(1);

    const winnerResponse = attempts.find(({ status }) => status === 200)!;
    const winner = await responseData<{ ok: true; data: WorkflowTaskClaim }>(winnerResponse);
    const read = await routeWorkflowStateCommand(runtimeEnv, {
      operation: "read",
      plan: candidatePlan,
    });
    expect(read.status).toBe(200);
    expect(await responseData(read)).toMatchObject({
      ok: true,
      data: { tasks: [{ taskId: "publish", state: "running", attempt: 1 }] },
    });

    const recovered = await routeWorkflowStateCommand(runtimeEnv, {
      operation: "recover_interrupted",
      plan: candidatePlan,
      claim: winner.data,
    });
    expect(recovered.status).toBe(200);

    const claimedAgain = await routeWorkflowStateCommand(runtimeEnv, {
      operation: "claim_next",
      plan: candidatePlan,
      claimId: "claim-routing-retry",
    });
    const retryClaim = (await responseData<{ ok: true; data: WorkflowTaskClaim }>(claimedAgain)).data;

    expect((await routeWorkflowStateCommand(runtimeEnv, {
      operation: "mark_effect_started",
      plan: candidatePlan,
      claim: retryClaim,
    })).status).toBe(200);

    const nextCheckpoint: ExecutionCheckpoint = {
      executionId: candidatePlan.executionId,
      sequence: 1,
      stateDigest: digest("b"),
    };
    expect((await routeWorkflowStateCommand(runtimeEnv, {
      operation: "commit_checkpoint",
      plan: candidatePlan,
      expected: initialCheckpoint(),
      candidate: nextCheckpoint,
    })).status).toBe(200);

    expect((await routeWorkflowStateCommand(runtimeEnv, {
      operation: "request_cancellation",
      plan: candidatePlan,
      cancellationId: "cancel-routing-001",
    })).status).toBe(200);

    expect((await routeWorkflowStateCommand(runtimeEnv, {
      operation: "complete",
      plan: candidatePlan,
      claim: retryClaim,
      outcome: "cancelled",
    })).status).toBe(200);

    expect((await routeWorkflowStateCommand(runtimeEnv, {
      operation: "resolve_blocked",
      plan: candidatePlan,
    })).status).toBe(200);
  });

  it("derives a privacy-preserving deterministic object name and separates executions", async () => {
    const first = await workflowStateObjectName("exec-durable-routing-001");
    const replay = await workflowStateObjectName("exec-durable-routing-001");
    const second = await workflowStateObjectName("exec-durable-routing-002");

    expect(first).toBe(replay);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^workflow:[0-9a-f]{64}$/);
    expect(first).not.toContain("exec-durable-routing-001");
    await expect(workflowStateObjectName(" invalid ")).rejects.toThrow(/execution identity/i);
  });

  it("fails closed for invalid internal requests and unavailable durable storage", async () => {
    const object = new NoemaWorkflowState({ storage: new TransactionalStorage() } as unknown as DurableObjectState);
    const endpoint = "https://noema-workflow-state.internal/command";

    expect((await object.fetch(new Request("https://wrong.internal/command", { method: "GET" }))).status).toBe(404);
    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      body: "{}",
    }))).status).toBe(415);
    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }))).status).toBe(400);
    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "unknown", plan: plan() }),
    }))).status).toBe(400);
    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "read", plan: { ...plan(), executionId: " invalid " } }),
    }))).status).toBe(400);

    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "mark_effect_started",
        plan: plan(),
        claim: null,
      }),
    }))).status).toBe(400);

    expect((await object.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "commit_checkpoint",
        plan: plan(),
        expected: { ...initialCheckpoint(), stateDigest: "not-a-digest" },
        candidate: initialCheckpoint(),
      }),
    }))).status).toBe(400);

    const unavailable = new NoemaWorkflowState({ storage: new ThrowingStorage() } as unknown as DurableObjectState);
    const unavailableResponse = await unavailable.fetch(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "initialize",
        plan: plan(),
        checkpoint: initialCheckpoint(),
      }),
    }));
    expect(unavailableResponse.status).toBe(503);
  });
});
