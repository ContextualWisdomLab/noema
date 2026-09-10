import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { assessProceduralCandidate } from "../src/agent-runtime/procedural-evolution.ts";

const raw = () => ({
  schemaVersion: "noema.procedural-graph/v1",
  tenantId: "tenant-a",
  taskType: "repair",
  graphId: "graph-a",
  revision: 1,
  parentDigest: null,
  nodes: ["Start", "check"],
  edges: [{
    from: "Start",
    relation: "requires",
    to: "check",
    condition: "",
    guidance: "Check evidence",
    pitfalls: "",
  }],
});

async function fixture() {
  const baseline = await createProceduralGraph(raw());
  const candidateInput = raw();
  candidateInput.revision = 2;
  candidateInput.parentDigest = baseline.digest;
  candidateInput.edges[0].guidance = "Check exact-head evidence";
  const candidate = await createProceduralGraph(candidateInput);
  const contextDigest = "c".repeat(64);
  const plan = {
    contextDigest,
    minimumCases: 2,
    trainingCaseIds: ["train-1"],
    holdoutCaseIds: ["case-1", "case-2"],
  };
  const receipt = (graph, firstScore, secondScore) => ({
    graphDigest: graph.digest,
    contextDigest,
    observations: [
      { caseId: "case-1", score: firstScore, safetyViolations: 0 },
      { caseId: "case-2", score: secondScore, safetyViolations: 0 },
    ],
  });
  return {
    baseline,
    candidate,
    plan,
    baselineReceipt: receipt(baseline, 0.5, 0.6),
    candidateReceipt: receipt(candidate, 0.7, 0.8),
    rejectedKeys: [],
  };
}

test("screening decision binds canonical identities of both paired evaluation receipts", async () => {
  const data = await fixture();
  const first = await assessProceduralCandidate(data);
  assert.match(first.baselineReceiptDigest, /^[0-9a-f]{64}$/);
  assert.match(first.candidateReceiptDigest, /^[0-9a-f]{64}$/);
  assert.notEqual(first.baselineReceiptDigest, first.candidateReceiptDigest);

  data.baselineReceipt.observations.reverse();
  data.candidateReceipt.observations.reverse();
  const reordered = await assessProceduralCandidate(data);
  assert.equal(reordered.baselineReceiptDigest, first.baselineReceiptDigest);
  assert.equal(reordered.candidateReceiptDigest, first.candidateReceiptDigest);
});

test("receipt identity changes when validated score evidence changes", async () => {
  const data = await fixture();
  const first = await assessProceduralCandidate(data);
  data.candidateReceipt.observations[0].score = 0.71;
  const changed = await assessProceduralCandidate(data);
  assert.notEqual(changed.candidateReceiptDigest, first.candidateReceiptDigest);
  assert.equal(changed.baselineReceiptDigest, first.baselineReceiptDigest);
});

test("receipt identity changes when validated safety evidence changes", async () => {
  const data = await fixture();
  const first = await assessProceduralCandidate(data);
  data.candidateReceipt.observations[0].safetyViolations = 1;
  const changed = await assessProceduralCandidate(data);
  assert.equal(changed.reason, "safety_violation");
  assert.notEqual(changed.candidateReceiptDigest, first.candidateReceiptDigest);
  assert.equal(changed.baselineReceiptDigest, first.baselineReceiptDigest);
});
