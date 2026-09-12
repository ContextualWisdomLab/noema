import { describe, expect, it } from "vitest";

import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph";
import {
  guideProceduralExecutionFromCurrentWorkflowState,
} from "../src/agent-runtime/procedural-current-lifecycle";
import type { WorkflowStateDurableObjectEnv } from "../src/workflow-task-execution/workflow-state-durable-object";
import type { WorkflowTaskPlan } from "../src/workflow-task-execution/task-plan";

const executionId = "run-current-lifecycle-response-bound";

function plan(): WorkflowTaskPlan {
  return {
    executionId,
    planId: "plan-current-lifecycle-response-bound",
    maxConcurrency: 1,
    tasks: [{ taskId: "review", dependsOn: [], effect: "pure" }],
  };
}

async function session() {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "pr-repair",
    graphId: "current-lifecycle-response-bound",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "review"],
    edges: [{
      from: "Start",
      relation: "leads_to",
      to: "review",
      condition: "",
      guidance: "Use only bounded current durable evidence",
      pitfalls: "Do not buffer unbounded internal responses",
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

async function expectInvalid(response: Response): Promise<void> {
  await expect(guideProceduralExecutionFromCurrentWorkflowState(
    envFor(response),
    plan(),
    await session(),
    { lastProcedure: null, hops: 1, maxEdges: 4 },
  )).rejects.toMatchObject({
    name: "ProceduralCurrentLifecycleError",
    code: "invalid_workflow_state_response",
  });
}

describe("procedural current-lifecycle response bounds", () => {
  it("cancels an oversized durable-owner stream before consuming later chunks", async () => {
    const chunks = [
      new Uint8Array(700 * 1024).fill(0x20),
      new Uint8Array(400 * 1024).fill(0x20),
      new TextEncoder().encode("{}"),
    ];
    let nextChunk = 0;
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (nextChunk >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[nextChunk]!);
        nextChunk += 1;
      },
      cancel() {
        cancelled = true;
        throw new Error("cleanup transport failed");
      },
    }, { highWaterMark: 0 });

    await expectInvalid(new Response(stream, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }));

    expect(cancelled).toBe(true);
    expect(nextChunk).toBe(2);
  });

  it("does not let stalled cancellation cleanup delay an oversized-response rejection", async () => {
    let markCancelStarted!: () => void;
    const cancelStarted = new Promise<void>((resolve) => {
      markCancelStarted = resolve;
    });
    let releaseCancellation!: () => void;
    const cancellationBarrier = new Promise<void>((resolve) => {
      releaseCancellation = resolve;
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array((1024 * 1024) + 1).fill(0x20));
      },
      cancel() {
        markCancelStarted();
        return cancellationBarrier;
      },
    }, { highWaterMark: 0 });

    const outcome = guideProceduralExecutionFromCurrentWorkflowState(
      envFor(new Response(stream, {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
      })),
      plan(),
      await session(),
      { lastProcedure: null, hops: 1, maxEdges: 4 },
    ).then(
      () => new Error("expected the oversized response to fail closed"),
      (error: unknown) => error,
    );

    await cancelStarted;
    let settled = false;
    void outcome.then(() => {
      settled = true;
    });
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const settledBeforeCleanup = settled;

    releaseCancellation();
    const error = await outcome;
    expect(error).toMatchObject({
      name: "ProceduralCurrentLifecycleError",
      code: "invalid_workflow_state_response",
    });
    expect(settledBeforeCleanup).toBe(true);

    const postFailureReader = stream.getReader();
    postFailureReader.releaseLock();
  });

  it("rejects a successful status with no response body", async () => {
    await expectInvalid(new Response(null, { status: 200 }));
  });

  it("fails closed on a malformed non-byte response chunk", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue("not-bytes" as unknown as Uint8Array);
        controller.close();
      },
    });
    await expectInvalid(new Response(stream, { status: 200 }));
  });

  it("normalizes a body-stream read failure to the stable fail-closed diagnostic", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error("durable stream failed"));
      },
    });
    await expectInvalid(new Response(stream, { status: 200 }));
  });
});
