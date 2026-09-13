import { afterEach, test, vi } from "vitest";
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

class ExpiryObservedStorage {
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
    tenantId: "tenant-freshness",
    taskType: "repair",
    graphId: "graph-freshness",
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
    tenantId: "tenant-freshness",
    taskType: "repair",
    graphId: "graph-freshness",
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

async function screenedDecision(baseline, candidate) {
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
        { caseId: "case-1", score: 0.8, safetyViolations: 0 },
        { caseId: "case-2", score: 0.8, safetyViolations: 0 },
      ],
    },
    rejectedKeys: [],
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
  const issuedAtEpochSeconds = now - 60 + sequence;
  const expiresAtEpochSeconds = now + 60;
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

function expireInsideNextTransaction(storage, authenticated) {
  storage.beforeTransaction = async () => {
    vi.spyOn(Date, "now").mockReturnValue((authenticated.expiresAtEpochSeconds + 1) * 1000);
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("rechecks authenticated handoff freshness before committing a preverified append", async () => {
  const { baseline, candidate } = await fixtureGraphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const first = await authenticatedEvaluation(decision, keys, 0);
  const second = await authenticatedEvaluation(decision, keys, 1);
  const storage = new ExpiryObservedStorage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, first, 0);
  expireInsideNextTransaction(storage, second);

  await assert.rejects(
    repository.append(candidate, second, 1),
    (error) => {
      assert.equal(error?.name, "ProceduralGraphError");
      assert.equal(error?.message, "evaluation_handoff_expired");
      return true;
    },
  );

  const [, retained] = storage.records.entries().next().value;
  assert.equal(retained.version, 1);
  assert.equal(retained.events[0].handoffDigest, first.handoffDigest);
});

test("rechecks authenticated handoff freshness before returning an exact replay", async () => {
  const { baseline, candidate } = await fixtureGraphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const first = await authenticatedEvaluation(decision, keys, 0);
  const storage = new ExpiryObservedStorage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, first, 0);
  expireInsideNextTransaction(storage, first);

  await assert.rejects(
    repository.append(candidate, first, 1),
    (error) => {
      assert.equal(error?.name, "ProceduralGraphError");
      assert.equal(error?.message, "evaluation_handoff_expired");
      return true;
    },
  );

  const [, retained] = storage.records.entries().next().value;
  assert.equal(retained.version, 1);
  assert.equal(retained.events[0].handoffDigest, first.handoffDigest);
});
