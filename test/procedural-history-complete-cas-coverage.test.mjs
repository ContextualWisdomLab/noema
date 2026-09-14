import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { assessProceduralCandidate } from "../src/agent-runtime/procedural-evolution.ts";
import {
  admitProceduralEvaluationEvidence,
  proceduralEvaluationEvidenceDigest,
} from "../src/agent-runtime/procedural-evaluation-authority.ts";
import { verifyProceduralEvaluationHandoff } from "../src/agent-runtime/procedural-evaluation-handoff.ts";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history.ts";

const digest = (character) => character.repeat(64);

class InterleavingStorage {
  constructor() {
    this.records = new Map();
    this.beforeTransaction = null;
  }

  async get(key) {
    const value = this.records.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(key, value) {
    this.records.set(key, structuredClone(value));
  }

  async transaction(callback) {
    const beforeTransaction = this.beforeTransaction;
    this.beforeTransaction = null;
    if (beforeTransaction !== null) await beforeTransaction();
    return callback(this);
  }
}

async function fixtureGraphs() {
  const baseline = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-complete-cas",
    taskType: "repair",
    graphId: "graph-complete-cas",
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
    tenantId: "tenant-complete-cas",
    taskType: "repair",
    graphId: "graph-complete-cas",
    revision: 2,
    parentDigest: baseline.digest,
    nodes: ["Start", "check"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "check",
      condition: "",
      guidance: "Check exact evidence",
      pitfalls: "",
    }],
  });
  return { baseline, candidate };
}

async function screenedDecision(baseline, candidate, { rejectedKeys = [], safetyViolations = 0 } = {}) {
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
        { caseId: "case-1", score: 0.8, safetyViolations },
        { caseId: "case-2", score: 0.8, safetyViolations },
      ],
    },
    rejectedKeys,
  });
}

async function admittedEvidence(decision) {
  const metadata = {
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
  };
  const expected = await proceduralEvaluationEvidenceDigest(decision, metadata);
  return admitProceduralEvaluationEvidence(decision, metadata, expected);
}

function handoffMessage(envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds) {
  return new TextEncoder().encode(JSON.stringify([
    "noema.procedural-evaluation-handoff/v1",
    envelopeDigest,
    signerKeyId,
    issuedAtEpochSeconds,
    expiresAtEpochSeconds,
  ]));
}

async function authenticatedEvaluation(decision, keys, sequence) {
  const evidence = await admittedEvidence(decision);
  const now = Math.floor(Date.now() / 1000);
  const issuedAtEpochSeconds = now - 120 + sequence;
  const expiresAtEpochSeconds = now + 120;
  const signerKeyId = "keyverse:evaluator/procedural-v1";
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    handoffMessage(evidence.envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds),
  );
  return verifyProceduralEvaluationHandoff(evidence, {
    schemaVersion: "noema.procedural-evaluation-handoff/v1",
    envelopeDigest: evidence.envelopeDigest,
    signerKeyId,
    issuedAtEpochSeconds,
    expiresAtEpochSeconds,
    signature: Buffer.from(signature).toString("base64url"),
  }, {
    signerKeyId,
    verificationKey: keys.publicKey,
  });
}

async function expectCasConflictAfterMutation(mutate, { rejectedFirst = false } = {}) {
  const { baseline, candidate } = await fixtureGraphs();
  const firstDecision = await screenedDecision(
    baseline,
    candidate,
    rejectedFirst ? { safetyViolations: 1 } : undefined,
  );
  const secondDecision = await screenedDecision(baseline, candidate);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const first = await authenticatedEvaluation(firstDecision, keys, 0);
  const second = await authenticatedEvaluation(secondDecision, keys, 1);
  const storage = new InterleavingStorage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, first, 0);
  storage.beforeTransaction = async () => {
    const [key, retained] = storage.records.entries().next().value;
    mutate(retained);
    storage.records.set(key, retained);
  };

  await assert.rejects(
    repository.append(candidate, second, 1),
    /expected history version lost the CAS race/,
  );
}

test.each([
  ["schema version", (retained) => { retained.schemaVersion = "noema.procedural-evaluation-history/v2"; }],
  ["stream identity", (retained) => { retained.stream.graphId = "graph-interleaved"; }],
  ["version", (retained) => { retained.version += 1; }],
  ["head digest", (retained) => { retained.headEventDigest = digest("d"); }],
])("rejects complete retained-state CAS drift in %s", async (_name, mutate) => {
  await expectCasConflictAfterMutation(mutate);
});

test("rejects same-length retained rejection projection drift", async () => {
  await expectCasConflictAfterMutation((retained) => {
    assert.equal(retained.rejectedKeys.length, 1);
    retained.rejectedKeys[0] = digest("9");
  }, { rejectedFirst: true });
});
