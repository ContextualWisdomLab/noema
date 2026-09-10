import { describe, expect, it } from "vitest";

import {
  NoemaWorkflowState,
  routeWorkflowStateCommand,
  workflowStateObjectName,
  type WorkflowStateDurableObjectEnv,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

class OperabilityStorage {
  readonly records = new Map<string, unknown>();
  readonly sql: { databaseSize: number };

  constructor(databaseSize = 4096) {
    this.sql = { databaseSize };
  }

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

  async transaction<T>(callback: (txn: OperabilityStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class CapturingWorkflowNamespace {
  readonly objects = new Map<string, NoemaWorkflowState>();
  readonly objectNames: string[] = [];
  lastBody: string | null = null;

  idFromName(name: string): DurableObjectId {
    this.objectNames.push(name);
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(id: DurableObjectId): DurableObjectStub {
    const name = id.toString();
    let object = this.objects.get(name);
    if (!object) {
      object = new NoemaWorkflowState({
        id,
        storage: new OperabilityStorage(),
      } as unknown as DurableObjectState);
      this.objects.set(name, object);
    }
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        this.lastBody = typeof init?.body === "string" ? init.body : null;
        return object!.fetch(new Request(input, init));
      },
    } as unknown as DurableObjectStub;
  }
}

const plan = (executionId = "exec-operability-001"): WorkflowTaskPlan => ({
  executionId,
  planId: "plan-operability-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "observe", dependsOn: [], effect: "pure" }],
});

async function responseData<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe("Workflow state Durable Object operability evidence", () => {
  it("routes a bounded exact-object SQLite size observation without exposing execution identity", async () => {
    const namespace = new CapturingWorkflowNamespace();
    const env = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    const candidatePlan = plan();

    const response = await routeWorkflowStateCommand(env, {
      operation: "read_operability",
      plan: candidatePlan,
      secret: "must-not-cross-boundary",
    } as const);

    expect(response.status).toBe(200);
    expect(await responseData(response)).toEqual({
      ok: true,
      data: { database_size_bytes: 4096 },
    });
    expect(namespace.objectNames).toEqual([await workflowStateObjectName(candidatePlan.executionId)]);
    expect(namespace.objectNames[0]).not.toContain(candidatePlan.executionId);
    expect(namespace.lastBody).not.toContain("must-not-cross-boundary");
  });

  it("rejects an operability observation routed to another execution authority", async () => {
    const storage = new OperabilityStorage();
    const object = new NoemaWorkflowState({
      id: { name: await workflowStateObjectName("exec-operability-001") } as DurableObjectId,
      storage,
    } as unknown as DurableObjectState);

    const response = await object.fetch(new Request("https://noema-workflow-state.internal/command", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ operation: "read_operability", plan: plan("exec-operability-002") }),
    }));

    expect(response.status).toBe(409);
    expect(await responseData(response)).toEqual({ ok: false, error: "conflict" });
  });

  it.each([-1, 1.5, Number.NaN])(
    "fails closed when exact-object SQLite size is unavailable (%s)",
    async (databaseSize) => {
      const objectName = await workflowStateObjectName("exec-operability-001");
      const object = new NoemaWorkflowState({
        id: { name: objectName } as DurableObjectId,
        storage: new OperabilityStorage(databaseSize),
      } as unknown as DurableObjectState);

      const response = await object.fetch(new Request("https://noema-workflow-state.internal/command", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ operation: "read_operability", plan: plan() }),
      }));

      expect(response.status).toBe(503);
      expect(await responseData(response)).toEqual({ ok: false, error: "storage_unavailable" });
    },
  );
});
