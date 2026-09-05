import { describe, expect, it } from "vitest";

import {
  routeWorkflowStateCommand,
  type WorkflowStateCommand,
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

  it("snapshots the command operation once before selecting payload fields", async () => {
    const namespace = new CapturingNamespace();
    const runtimeEnv = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    let operationReads = 0;
    const command = {
      get operation() {
        operationReads += 1;
        return operationReads === 1 ? "read" : "complete";
      },
      plan,
      get claim() {
        throw new Error("a later operation read must not widen the payload family");
      },
      get outcome() {
        throw new Error("a later operation read must not widen the payload family");
      },
    } as unknown as WorkflowStateCommand;

    const response = await routeWorkflowStateCommand(runtimeEnv, command);

    expect(response.status).toBe(200);
    expect(operationReads).toBe(1);
    expect(JSON.parse(namespace.capturedBody)).toEqual({ operation: "read", plan });
  });

  it("projects nested claim authority without transporting structurally compatible extras", async () => {
    const namespace = new CapturingNamespace();
    const runtimeEnv = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    const claim = {
      executionId: plan.executionId,
      planId: plan.planId,
      taskId: "inspect",
      claimId: "claim-payload-minimization-001",
      attempt: 1,
      effect: "pure" as const,
      foreignDomainPayload: "must-not-cross-inside-claim",
    };
    Object.defineProperty(claim, "ambientSecret", {
      enumerable: true,
      get() {
        throw new Error("nested extra caller payload must not be evaluated");
      },
    });
    const command = {
      operation: "complete" as const,
      plan,
      claim,
      outcome: "succeeded" as const,
    } satisfies WorkflowStateCommand;

    const response = await routeWorkflowStateCommand(runtimeEnv, command);

    expect(response.status).toBe(200);
    expect(JSON.parse(namespace.capturedBody)).toEqual({
      operation: "complete",
      plan,
      claim: {
        executionId: plan.executionId,
        planId: plan.planId,
        taskId: "inspect",
        claimId: "claim-payload-minimization-001",
        attempt: 1,
        effect: "pure",
      },
      outcome: "succeeded",
    });
    expect(namespace.capturedBody).not.toContain("foreignDomainPayload");
    expect(namespace.capturedBody).not.toContain("must-not-cross-inside-claim");
  });

  it("projects nested checkpoint authority without transporting structurally compatible extras", async () => {
    const namespace = new CapturingNamespace();
    const runtimeEnv = {
      NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace,
    } satisfies WorkflowStateDurableObjectEnv;
    const checkpoint = {
      executionId: plan.executionId,
      sequence: 0,
      stateDigest: "a".repeat(64),
      foreignDomainPayload: "must-not-cross-inside-checkpoint",
    };
    Object.defineProperty(checkpoint, "ambientSecret", {
      enumerable: true,
      get() {
        throw new Error("nested checkpoint extras must not be evaluated");
      },
    });
    const command = {
      operation: "initialize" as const,
      plan,
      checkpoint,
    } satisfies WorkflowStateCommand;

    const response = await routeWorkflowStateCommand(runtimeEnv, command);

    expect(response.status).toBe(200);
    expect(JSON.parse(namespace.capturedBody)).toEqual({
      operation: "initialize",
      plan,
      checkpoint: {
        executionId: plan.executionId,
        sequence: 0,
        stateDigest: "a".repeat(64),
      },
    });
    expect(namespace.capturedBody).not.toContain("foreignDomainPayload");
    expect(namespace.capturedBody).not.toContain("must-not-cross-inside-checkpoint");
  });
});
