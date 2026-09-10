import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { assessProceduralCandidate } from "../src/agent-runtime/procedural-evolution.ts";
import {
  admitProceduralEvaluationEvidence,
  assertProceduralEvaluationEvidence,
  proceduralEvaluationEvidenceDigest,
} from "../src/agent-runtime/procedural-evaluation-authority.ts";

const digest = (character) => character.repeat(64);

async function screenedDecision() {
  const baseline = await createProceduralGraph({
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
  const candidate = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-a",
    taskType: "repair",
    graphId: "graph-a",
    revision: 2,
    parentDigest: baseline.digest,
    nodes: ["Start", "check"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "check",
      condition: "",
      guidance: "Check exact-head evidence",
      pitfalls: "",
    }],
  });
  const contextDigest = digest("c");
  return assessProceduralCandidate({
    baseline,
    candidate,
    plan: {
      contextDigest,
      minimumCases: 2,
      trainingCaseIds: ["train-1"],
      holdoutCaseIds: ["case-1", "case-2"],
    },
    baselineReceipt: {
      graphDigest: baseline.digest,
      contextDigest,
      observations: [
        { caseId: "case-1", score: 0.5, safetyViolations: 0 },
        { caseId: "case-2", score: 0.6, safetyViolations: 0 },
      ],
    },
    candidateReceipt: {
      graphDigest: candidate.digest,
      contextDigest,
      observations: [
        { caseId: "case-1", score: 0.7, safetyViolations: 0 },
        { caseId: "case-2", score: 0.8, safetyViolations: 0 },
      ],
    },
    rejectedKeys: [],
  });
}

const authorityInput = () => ({
  schemaVersion: "noema.procedural-evaluation-authority/v1",
  evaluatorId: "evaluation-owner",
  evaluatorVersion: "eval-v1",
  policyVersion: "policy-v1",
  datasetDigest: digest("1"),
  rubricDigest: digest("2"),
  modelIdentityDigest: digest("3"),
  toolIdentityDigest: digest("4"),
  protocolDigest: digest("5"),
  validationPlanDigest: digest("6"),
});

test("admits only an exact evaluation envelope digest from the trusted handoff", async () => {
  const decision = await screenedDecision();
  const input = authorityInput();
  const expectedDigest = await proceduralEvaluationEvidenceDigest(decision, input);
  const admitted = await admitProceduralEvaluationEvidence(
    decision,
    input,
    expectedDigest,
  );

  assertProceduralEvaluationEvidence(admitted);
  assert.equal(admitted.envelopeDigest, expectedDigest);
  assert.equal(admitted.candidateDigest, decision.candidateDigest);
  assert.equal(admitted.baselineReceiptDigest, decision.baselineReceiptDigest);
  assert.equal(admitted.candidateReceiptDigest, decision.candidateReceiptDigest);
  assert.equal(admitted.activationAuthorized, false);
});

test("rejects caller-created structural lookalikes", () => {
  assert.throws(
    () => assertProceduralEvaluationEvidence(Object.freeze({
      envelopeDigest: digest("a"),
      activationAuthorized: false,
    })),
    /unadmitted_evaluation_evidence/,
  );
});

test("rejects changed evaluation semantics against a previously authenticated digest", async () => {
  const decision = await screenedDecision();
  const input = authorityInput();
  const expectedDigest = await proceduralEvaluationEvidenceDigest(decision, input);
  const changed = { ...input, rubricDigest: digest("7") };

  await assert.rejects(
    admitProceduralEvaluationEvidence(decision, changed, expectedDigest),
    /evaluation_evidence_digest_mismatch/,
  );
});

test("rejects a malformed trusted handoff digest before admitting evidence", async () => {
  const decision = await screenedDecision();
  await assert.rejects(
    admitProceduralEvaluationEvidence(decision, authorityInput(), "not-a-digest"),
    /invalid_digest/,
  );
});

test("rejects an unsupported evaluation schema through the digest boundary", async () => {
  const decision = await screenedDecision();
  await assert.rejects(
    proceduralEvaluationEvidenceDigest(decision, {
      ...authorityInput(),
      schemaVersion: "noema.procedural-evaluation-authority/v2",
    }),
    /unsupported_schema/,
  );
});
