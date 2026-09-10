import { describe, expect, it } from "vitest";

import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph";
import {
  guideProceduralExecutionFromCurrentWorkflowState,
  type ProceduralCurrentLifecycleErrorCode,
} from "../src/agent-runtime/procedural-current-lifecycle";
import type { WorkflowStateDurableObjectEnv } from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

type TaskState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";

type ResponseStep = Response | Error;

const executionId = "run-current-lifecycle-fail-closed";

function plan(): WorkflowTaskPlan {
  return {
    executionId,
    planId: "plan-current-lifecycle-fail-closed",
    maxConcurrency: 1,
    tasks: [
      { taskId: "review", dependsOn: [], effect: "pure" },
      { taskId: "verify", dependsOn: ["review"], effect: "pure" },
    ],
  };
}

function snapshot(states: readonly TaskState[], transitionSequence = 2): Record<string, unknown> {
  return {
    executionId,
    planId: plan().planId,
    policy: {
      policyVersion: "workflow-execution-policy.v1",
      schedulingPolicy: "admission_order",
      maxAutomaticRecoveryAttempts: 3,
    },
    cancellation: { requested: false, cancellationId: null },
    checkpoint: { executionId, sequence: 0, stateDigest: "a".repeat(64) },
    tasks: states.map((state, index) => ({
      taskId: plan().tasks[index]!.taskId,
      state,
      attempt: state === "pending" ? 0 : 1,
      activeClaimId: state === "running" ? `claim-${index}` : null,
      effectStarted: null,
    })),
    transitionSequence,
    transitionReceipts: [],
  };
}

function ok(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status: 200 });
}

class WorkflowNamespace {
  private readonly steps: ResponseStep[];

  constructor(steps: readonly ResponseStep[]) {
    this.steps = [...steps];
  }

  idFromName(name: string): DurableObjectId {
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return {
      fetch: async () => {
        const step = this.steps.shift();
        if (step === undefined) throw new Error("no response configured");
        if (step instanceof Error) throw step;
        return step.clone();
      },
    } as unknown as DurableObjectStub;
  }
}

function env(...steps: ResponseStep[]): WorkflowStateDurableObjectEnv {
  return {
    NOEMA_WORKFLOW_STATE: new WorkflowNamespace(steps) as unknown as DurableObjectNamespace,
  };
}

async function proceduralSession() {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "pr-repair",
    graphId: "current-lifecycle-fail-closed",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "review"],
    edges: [{
      from: "Start",
      relation: "leads_to",
      to: "review",
      condition: "",
      guidance: "Use only current durable evidence",
      pitfalls: "Do not trust cached lifecycle state",
    }],
  });
  return startProceduralSession(graph, {
    tenantId: "tenant-a",
    taskType: "pr-repair",
    executionId,
    graphDigest: graph.digest,
  });
}

async function expectFailure(step: ResponseStep, code: ProceduralCurrentLifecycleErrorCode): Promise<void> {
  const session = await proceduralSession();
  await expect(guideProceduralExecutionFromCurrentWorkflowState(
    env(step),
    plan(),
    session,
    { lastProcedure: null, hops: 1, maxEdges: 4 },
  )).rejects.toMatchObject({ name: "ProceduralCurrentLifecycleError", code });
}

describe("procedural current lifecycle fail-closed evidence validation", () => {
  it("classifies durable owner conflict, outage, transport failure, and unexpected status separately", async () => {
    await expectFailure(
      new Response(JSON.stringify({ ok: false, error: "conflict" }), { status: 409 }),
      "workflow_state_conflict",
    );
    await expectFailure(
      new Response(JSON.stringify({ ok: false, error: "storage_unavailable" }), { status: 503 }),
      "workflow_state_unavailable",
    );
    await expectFailure(new Error("binding unavailable"), "workflow_state_unavailable");
    await expectFailure(
      new Response(JSON.stringify({ ok: false, error: "invalid_request" }), { status: 400 }),
      "invalid_workflow_state_response",
    );
  });

  it("rejects malformed success envelopes before they can become lifecycle evidence", async () => {
    await expectFailure(new Response("{", { status: 200 }), "invalid_workflow_state_response");
    await expectFailure(ok(null), "invalid_workflow_state_response");
    await expectFailure(
      new Response(JSON.stringify({ ok: false, data: snapshot(["running", "pending"]) }), { status: 200 }),
      "invalid_workflow_state_response",
    );
  });

  it.each([
    ["cross execution", { ...snapshot(["running", "pending"]), executionId: "other-run" }],
    ["cross plan", { ...snapshot(["running", "pending"]), planId: "other-plan" }],
    ["noninteger transition sequence", { ...snapshot(["running", "pending"]), transitionSequence: "2" }],
    ["negative transition sequence", { ...snapshot(["running", "pending"]), transitionSequence: -1 }],
    ["missing cancellation", { ...snapshot(["running", "pending"]), cancellation: null }],
    ["nonboolean cancellation", { ...snapshot(["running", "pending"]), cancellation: { requested: "no", cancellationId: null } }],
    ["missing cancellation identity", { ...snapshot(["running", "pending"]), cancellation: { requested: true, cancellationId: null } }],
    ["noncanonical cancellation identity", { ...snapshot(["running", "pending"]), cancellation: { requested: true, cancellationId: "bad id" } }],
    ["unexpected cancellation identity", { ...snapshot(["running", "pending"]), cancellation: { requested: false, cancellationId: "cancel-unused" } }],
    ["nonarray tasks", { ...snapshot(["running", "pending"]), tasks: null }],
    ["wrong task count", { ...snapshot(["running", "pending"]), tasks: [snapshot(["running", "pending"]).tasks as unknown] }],
  ])("rejects malformed top-level current evidence: %s", async (_label, data) => {
    await expectFailure(ok(data), "invalid_workflow_state_response");
  });

  it.each([
    ["nonrecord task", [null, { taskId: "verify", state: "pending" }]],
    ["nonstring task identity", [{ taskId: 7, state: "running" }, { taskId: "verify", state: "pending" }]],
    ["foreign task", [{ taskId: "foreign", state: "running" }, { taskId: "verify", state: "pending" }]],
    ["duplicate task", [{ taskId: "review", state: "running" }, { taskId: "review", state: "pending" }]],
    ["nonstring state", [{ taskId: "review", state: 7 }, { taskId: "verify", state: "pending" }]],
    ["unknown state", [{ taskId: "review", state: "invented" }, { taskId: "verify", state: "pending" }]],
  ])("rejects malformed task-state evidence: %s", async (_label, tasks) => {
    await expectFailure(ok({ ...snapshot(["running", "pending"]), tasks }), "invalid_workflow_state_response");
  });

  it.each([
    [["failed", "blocked"] as const, "failed"],
    [["blocked", "cancelled"] as const, "failed"],
    [["succeeded", "cancelled"] as const, "cancelled"],
    [["succeeded", "succeeded"] as const, "succeeded"],
  ])("maps terminal workflow evidence %j only to a suppressing Agent Runtime ACL projection", async (states, expectedState) => {
    const session = await proceduralSession();
    const result = await guideProceduralExecutionFromCurrentWorkflowState(
      env(ok(snapshot(states, 8))),
      plan(),
      session,
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(result.available).toBe(false);
    expect(result.reason).toBe("terminal_execution");
    expect(result.lifecycleState).toBe(expectedState);
  });

  it("treats all-pending state as pre-start only before durable execution evidence advances", async () => {
    const session = await proceduralSession();
    const preStart = await guideProceduralExecutionFromCurrentWorkflowState(
      env(ok(snapshot(["pending", "pending"], 0))),
      plan(),
      session,
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(preStart.reason).toBe("execution_not_started");

    const recovered = await guideProceduralExecutionFromCurrentWorkflowState(
      env(ok(snapshot(["pending", "pending"], 2))),
      plan(),
      session,
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(recovered.reason).toBe("running_execution");
    expect(recovered.available).toBe(true);
  });

  it("keeps mixed current work running even when the first durable transition count is one", async () => {
    const session = await proceduralSession();
    const result = await guideProceduralExecutionFromCurrentWorkflowState(
      env(ok(snapshot(["running", "pending"], 1))),
      plan(),
      session,
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(result.available).toBe(true);
    expect(result.lifecycleState).toBe("running");
  });
});
