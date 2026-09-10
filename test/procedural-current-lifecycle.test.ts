import { describe, expect, it } from "vitest";

import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph";
import {
  ProceduralCurrentLifecycleError,
  guideProceduralExecutionFromCurrentWorkflowState,
} from "../src/agent-runtime/procedural-current-lifecycle";
import type { WorkflowStateDurableObjectEnv } from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

const digest = (character: string): string => character.repeat(64);

type TaskState = "pending" | "running" | "succeeded" | "failed" | "cancelled" | "blocked";

function plan(executionId = "run-current-lifecycle-001"): WorkflowTaskPlan {
  return {
    executionId,
    planId: "plan-current-lifecycle-001",
    maxConcurrency: 1,
    tasks: [
      { taskId: "review", dependsOn: [], effect: "pure" },
      { taskId: "verify", dependsOn: ["review"], effect: "pure" },
    ],
  };
}

function snapshot(
  states: readonly TaskState[],
  options: { cancellation?: boolean; transitionSequence?: number } = {},
): Record<string, unknown> {
  const candidatePlan = plan();
  return {
    executionId: candidatePlan.executionId,
    planId: candidatePlan.planId,
    policy: {
      policyVersion: "workflow-execution-policy.v1",
      schedulingPolicy: "admission_order",
      maxAutomaticRecoveryAttempts: 3,
    },
    cancellation: options.cancellation
      ? { requested: true, cancellationId: "cancel-current-lifecycle-001" }
      : { requested: false, cancellationId: null },
    checkpoint: {
      executionId: candidatePlan.executionId,
      sequence: 0,
      stateDigest: digest("a"),
    },
    tasks: states.map((state, index) => ({
      taskId: candidatePlan.tasks[index]!.taskId,
      state,
      attempt: state === "pending" ? 0 : 1,
      activeClaimId: state === "running" ? `claim-${index + 1}` : null,
      effectStarted: state === "running" ? false : null,
    })),
    transitionSequence: options.transitionSequence ?? 1,
    transitionReceipts: [],
  };
}

function ok(data: Record<string, unknown>): Response {
  return new Response(JSON.stringify({ ok: true, data }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

class SequencedWorkflowNamespace {
  readonly requests: Record<string, unknown>[] = [];
  private readonly responses: (() => Response)[];

  constructor(responses: readonly Response[]) {
    this.responses = responses.map((response) => () => response.clone());
  }

  idFromName(name: string): DurableObjectId {
    return { name, toString: () => name } as unknown as DurableObjectId;
  }

  get(_id: DurableObjectId): DurableObjectStub {
    return {
      fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        this.requests.push(await request.clone().json() as Record<string, unknown>);
        const next = this.responses.shift();
        if (next === undefined) throw new Error("unexpected workflow-state read");
        return next();
      },
    } as unknown as DurableObjectStub;
  }
}

async function session(executionId = plan().executionId) {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "pr-repair",
    graphId: "current-lifecycle",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "review"],
    edges: [{
      from: "Start",
      relation: "leads_to",
      to: "review",
      condition: "",
      guidance: "Review fresh execution evidence",
      pitfalls: "Do not replay stale running state",
    }],
  });
  return startProceduralSession(graph, {
    tenantId: "tenant-a",
    taskType: "pr-repair",
    executionId,
    graphDigest: graph.digest,
  });
}

function runtimeEnv(namespace: SequencedWorkflowNamespace): WorkflowStateDurableObjectEnv {
  return { NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace };
}

describe("procedural guidance current durable lifecycle ACL", () => {
  it("re-reads durable workflow authority so a stale running decision cannot survive cancellation", async () => {
    const namespace = new SequencedWorkflowNamespace([
      ok(snapshot(["succeeded", "pending"], { transitionSequence: 4 })),
      ok(snapshot(["succeeded", "cancelled"], { cancellation: true, transitionSequence: 6 })),
    ]);
    const proceduralSession = await session();
    const request = { lastProcedure: null, hops: 1, maxEdges: 4 };

    const running = await guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace),
      plan(),
      proceduralSession,
      request,
    );
    expect(running.available).toBe(true);
    expect(running.reason).toBe("running_execution");

    const cancelled = await guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace),
      plan(),
      proceduralSession,
      request,
    );
    expect(cancelled.available).toBe(false);
    expect(cancelled.reason).toBe("cancellation_requested");
    expect(namespace.requests).toHaveLength(2);
    expect(namespace.requests.every((command) => command.operation === "read")).toBe(true);
  });

  it("suppresses guidance before any durable workflow execution transition and after terminal work", async () => {
    const namespace = new SequencedWorkflowNamespace([
      ok(snapshot(["pending", "pending"], { transitionSequence: 1 })),
      ok(snapshot(["succeeded", "succeeded"], { transitionSequence: 7 })),
    ]);
    const proceduralSession = await session();

    const accepted = await guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace), plan(), proceduralSession, { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(accepted.available).toBe(false);
    expect(accepted.reason).toBe("execution_not_started");
    expect(accepted.lifecycleState).toBe("accepted");

    const terminal = await guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace), plan(), proceduralSession, { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    expect(terminal.available).toBe(false);
    expect(terminal.reason).toBe("terminal_execution");
    expect(terminal.lifecycleState).toBe("succeeded");
  });

  it("does not inspect a hostile guidance request when fresh durable authority is non-running", async () => {
    const namespace = new SequencedWorkflowNamespace([
      ok(snapshot(["succeeded", "cancelled"], { cancellation: true, transitionSequence: 6 })),
    ]);
    const proceduralSession = await session();
    const hostile = new Proxy({}, {
      ownKeys() { throw new Error("guidance request must not be read"); },
      getOwnPropertyDescriptor() { throw new Error("guidance request must not be read"); },
    });

    await expect(guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace), plan(), proceduralSession, hostile,
    )).resolves.toMatchObject({ available: false, reason: "cancellation_requested" });
  });

  it("rejects a cross-execution procedural session before contacting another workflow-state owner", async () => {
    const namespace = new SequencedWorkflowNamespace([]);
    const proceduralSession = await session();

    await expect(guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(namespace),
      plan("run-current-lifecycle-foreign"),
      proceduralSession,
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    )).rejects.toMatchObject({
      name: "ProceduralExecutionError",
      message: "execution_identity_mismatch",
    });
    expect(namespace.requests).toHaveLength(0);
  });

  it("fails closed when the durable owner cannot provide a trustworthy current snapshot", async () => {
    const conflict = new SequencedWorkflowNamespace([
      new Response(JSON.stringify({ ok: false, error: "conflict" }), { status: 409 }),
    ]);
    const malformed = new SequencedWorkflowNamespace([
      ok({ ...snapshot(["succeeded", "pending"], { transitionSequence: 4 }), planId: "foreign-plan" }),
    ]);
    const proceduralSession = await session();

    await expect(guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(conflict), plan(), proceduralSession, { lastProcedure: null, hops: 1, maxEdges: 4 },
    )).rejects.toMatchObject({
      name: "ProceduralCurrentLifecycleError",
      code: "workflow_state_conflict",
    } satisfies Partial<ProceduralCurrentLifecycleError>);

    await expect(guideProceduralExecutionFromCurrentWorkflowState(
      runtimeEnv(malformed), plan(), proceduralSession, { lastProcedure: null, hops: 1, maxEdges: 4 },
    )).rejects.toMatchObject({
      name: "ProceduralCurrentLifecycleError",
      code: "invalid_workflow_state_response",
    } satisfies Partial<ProceduralCurrentLifecycleError>);
  });
});