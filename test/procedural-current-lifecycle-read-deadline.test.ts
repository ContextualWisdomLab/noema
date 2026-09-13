import { afterEach, describe, expect, it, vi } from "vitest";

import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph";
import { guideProceduralExecutionFromCurrentWorkflowState } from "../src/agent-runtime/procedural-current-lifecycle";
import type { WorkflowStateDurableObjectEnv } from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

const executionId = "run-current-lifecycle-read-deadline";

function plan(): WorkflowTaskPlan {
  return {
    executionId,
    planId: "plan-current-lifecycle-read-deadline",
    maxConcurrency: 1,
    tasks: [{ taskId: "review", dependsOn: [], effect: "pure" }],
  };
}

async function session() {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "pr-repair",
    graphId: "current-lifecycle-read-deadline",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "review"],
    edges: [{
      from: "Start",
      relation: "leads_to",
      to: "review",
      condition: "",
      guidance: "Use only bounded current durable evidence",
      pitfalls: "Do not wait forever for an unreadable durable response",
    }],
  });
  return startProceduralSession(graph, {
    tenantId: "tenant-a",
    taskType: "pr-repair",
    executionId,
    graphDigest: graph.digest,
  });
}

function envFor(response: Response): WorkflowStateDurableObjectEnv {
  const namespace = {
    idFromName(name: string): DurableObjectId {
      return { name, toString: () => name } as unknown as DurableObjectId;
    },
    get(_id: DurableObjectId): DurableObjectStub {
      return { fetch: async () => response } as unknown as DurableObjectStub;
    },
  };
  return { NOEMA_WORKFLOW_STATE: namespace as unknown as DurableObjectNamespace };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("procedural current-lifecycle read deadline", () => {
  it("fails closed and releases the reader when a successful durable response never yields a chunk", async () => {
    vi.useFakeTimers();
    let cancelled = false;
    let released = false;
    let signalReadStarted!: () => void;
    const readStarted = new Promise<void>((resolve) => {
      signalReadStarted = resolve;
    });
    const reader = {
      read() {
        signalReadStarted();
        return new Promise<never>(() => undefined);
      },
      cancel() {
        cancelled = true;
        throw new Error("deadline cleanup transport failed");
      },
      releaseLock() {
        released = true;
      },
    };
    const response = {
      status: 200,
      body: { getReader: () => reader },
    } as unknown as Response;

    const pending = guideProceduralExecutionFromCurrentWorkflowState(
      envFor(response),
      plan(),
      await session(),
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    );
    const rejection = expect(pending).rejects.toMatchObject({
      name: "ProceduralCurrentLifecycleError",
      code: "invalid_workflow_state_response",
    });

    await readStarted;
    await vi.advanceTimersByTimeAsync(10_001);
    await rejection;

    expect(cancelled).toBe(true);
    expect(released).toBe(true);
  });
});
