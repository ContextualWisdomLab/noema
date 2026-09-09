import { test } from "vitest";
import assert from "node:assert/strict";
import { transitionExecutionLifecycle } from "../src/agent-runtime/execution-lifecycle.ts";
import { createProceduralGraph, startProceduralSession } from "../src/agent-runtime/procedural-graph.ts";
import { guideProceduralExecution } from "../src/agent-runtime/procedural-execution.ts";

const fail = code => error => error.name === "ProceduralExecutionError" && error.message === code;

async function fixture() {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "pr-repair",
    graphId: "review-loop",
    revision: 1,
    parentDigest: null,
    nodes: ["Start", "review", "verify"],
    edges: [
      {from: "Start", relation: "leads_to", to: "review", condition: "", guidance: "Review current evidence", pitfalls: "Do not reuse stale evidence"},
      {from: "review", relation: "leads_to", to: "verify", condition: "", guidance: "Verify finding against exact source", pitfalls: "Advice is not approval"},
    ],
  });
  const session = startProceduralSession(graph, {
    tenantId: "tenant-a", taskType: "pr-repair", executionId: "run-1", graphDigest: graph.digest,
  });
  const accepted = Object.freeze({executionId: "run-1", state: "accepted"});
  const running = transitionExecutionLifecycle(accepted, {executionId: "run-1", signal: "start"});
  return {graph, session, accepted, running};
}

test("does not expose procedural advice before execution starts", async () => {
  const {session, accepted} = await fixture();
  const result = guideProceduralExecution(accepted, session, {lastProcedure: null, hops: 2, maxEdges: 16});
  assert.equal(result.available, false);
  assert.equal(result.reason, "execution_not_started");
  assert.equal(result.context, null);
});

test("returns the pinned advisory context only while the same execution is running", async () => {
  const {graph, session, running} = await fixture();
  const result = guideProceduralExecution(running, session, {lastProcedure: null, hops: 2, maxEdges: 16});
  assert.equal(result.available, true);
  assert.equal(result.reason, "running_execution");
  assert.equal(result.executionId, "run-1");
  assert.equal(result.graphDigest, graph.digest);
  assert.equal(result.context.authority, "advisory_only");
  assert.deepEqual(result.context.nodes, ["Start", "review", "verify"]);
  assert.ok(Object.isFrozen(result));
});

test("cancellation suppresses further procedural guidance", async () => {
  const {session, running} = await fixture();
  const cancelling = transitionExecutionLifecycle(running, {executionId: "run-1", signal: "request_cancellation"});
  const result = guideProceduralExecution(cancelling, session, {lastProcedure: null, hops: 2, maxEdges: 16});
  assert.equal(result.available, false);
  assert.equal(result.reason, "cancellation_requested");
  assert.equal(result.context, null);
});

for (const [signal, state] of [["complete_success", "succeeded"], ["complete_failure", "failed"]]) {
  test(`terminal ${state} execution never receives additional guidance`, async () => {
    const {session, running} = await fixture();
    const terminal = transitionExecutionLifecycle(running, {executionId: "run-1", signal});
    const result = guideProceduralExecution(terminal, session, {lastProcedure: null, hops: 2, maxEdges: 16});
    assert.equal(result.available, false);
    assert.equal(result.reason, "terminal_execution");
    assert.equal(result.context, null);
  });
}

test("cancelled execution never receives additional guidance", async () => {
  const {session, running} = await fixture();
  const cancelling = transitionExecutionLifecycle(running, {executionId: "run-1", signal: "request_cancellation"});
  const cancelled = transitionExecutionLifecycle(cancelling, {executionId: "run-1", signal: "confirm_cancelled"});
  assert.equal(guideProceduralExecution(cancelled, session, {lastProcedure: null, hops: 2, maxEdges: 16}).reason, "terminal_execution");
});

test("fails closed when lifecycle and graph session identities differ", async () => {
  const {session} = await fixture();
  const different = Object.freeze({executionId: "run-2", state: "running"});
  assert.throws(() => guideProceduralExecution(different, session, {lastProcedure: null, hops: 2, maxEdges: 16}), fail("execution_identity_mismatch"));
});

for (const lifecycle of [
  null,
  {executionId: "run-1", state: "invented"},
  {executionId: "run 1", state: "running"},
  {executionId: "run-1", state: "running", approved: true},
]) test(`rejects malformed lifecycle ${JSON.stringify(lifecycle)}`, async () => {
  const {session} = await fixture();
  assert.throws(() => guideProceduralExecution(lifecycle, session, {lastProcedure: null, hops: 2, maxEdges: 16}), fail("invalid_execution_lifecycle"));
});

test("rejects lifecycle accessors without invoking them", async () => {
  const {session} = await fixture();
  const lifecycle = {};
  Object.defineProperty(lifecycle, "executionId", {enumerable: true, get() {throw new Error("SECRET");}});
  Object.defineProperty(lifecycle, "state", {enumerable: true, value: "running"});
  assert.throws(() => guideProceduralExecution(lifecycle, session, {lastProcedure: null, hops: 2, maxEdges: 16}), fail("invalid_execution_lifecycle"));
});

test("does not touch the guidance request when execution is not active", async () => {
  const {session, accepted} = await fixture();
  const request = new Proxy({}, {getOwnPropertyDescriptor() {throw new Error("must not read");}, ownKeys() {throw new Error("must not read");}});
  const result = guideProceduralExecution(accepted, session, request);
  assert.equal(result.reason, "execution_not_started");
});
