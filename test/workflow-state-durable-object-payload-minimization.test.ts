import { describe, expect, it } from "vitest";

import {
  routeWorkflowStateCommand,
  type WorkflowStateDurableObjectEnv,
} from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

const plan: WorkflowTaskPlan = {
  executionId: "exec-payload-minimization-001",
  planId: "plan-payload-minimization-001",
  maxConcurrency: 1,
  tasks: [{ taskId: "inspect", dependsOn: [], effect: "pure" }],
};

class CapturingNamespace {
  capturedBody = "";

  idFromName(name: string): DurableObjectId {
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return {
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        this.capturedBody = String(init?.body ?? "");
        return new Response(JSON.stringify({ ok: true, data: {} }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    } as unknown as DurableObjectStub;
  }
}

describe("Workflow state Durable Object payload minimization", () => {
  it("serializes only command-authority fields and never touches extra caller payload", async () => {
    const namespace = new CapturingNamespace();
    const runtimeEnv = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    const command = {
      operation: "read" as const,
      plan,
      foreignDomainPayload: "must-not-cross-the-durable-object-boundary",
    };
    Object.defineProperty(command, "ambientSecret", {
      enumerable: true,
      get() {
        throw new Error("extra caller payload must not be evaluated");
      },
    });

    const response = await routeWorkflowStateCommand(runtimeEnv, command);

    expect(response.status).toBe(200);
    expect(JSON.parse(namespace.capturedBody)).toEqual({ operation: "read", plan });
    expect(namespace.capturedBody).not.toContain("foreignDomainPayload");
    expect(namespace.capturedBody).not.toContain("must-not-cross-the-durable-object-boundary");
  });
});
