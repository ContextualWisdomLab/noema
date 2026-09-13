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

class TransactionObservedStorage {
  constructor() {
    this.records = new Map();
    this.inTransaction = false;
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
    assert.equal(this.inTransaction, false, "nested transaction observation is not supported");
    const beforeTransaction = this.beforeTransaction;
    this.beforeTransaction = null;
    if (beforeTransaction !== null) await beforeTransaction();
    this.inTransaction = true;
    try {
      return await callback(this);
    } finally {
      this.inTransaction = false;
    }
  }
}

async function fixtureGraphs() {
  const baseline = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-transaction",
    taskType: "repair",
    graphId: "graph-transaction",
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
    tenantId: "tenant-transaction",
    taskType: "repair",
    graphId: "graph-transaction",
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

afterEach(() => {
  vi.restoreAllMocks();
});

test("keeps digest verification and event hashing outside the Durable Object transaction", async () => {
  const { baseline, candidate } = await fixtureGraphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const first = await authenticatedEvaluation(decision, keys, 0);
  const second = await authenticatedEvaluation(decision, keys, 1);
  const storage = new TransactionObservedStorage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, first, 0);

  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  let digestCallsInsideTransaction = 0;
  vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
    if (storage.inTransaction) digestCallsInsideTransaction += 1;
    return originalDigest(...args);
  });

  const appended = await repository.append(candidate, second, 1);

  assert.equal(appended.kind, "accepted");
  assert.equal(appended.snapshot.version, 2);
  assert.equal(
    digestCallsInsideTransaction,
    0,
    "bounded-history verification and hashing must complete before the atomic CAS/write section",
  );
});

test("rejects a stale preverified append when another writer wins before the CAS transaction", async () => {
  const { baseline, candidate } = await fixtureGraphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
  const first = await authenticatedEvaluation(decision, keys, 0);
  const stale = await authenticatedEvaluation(decision, keys, 1);
  const winner = await authenticatedEvaluation(decision, keys, 2);
  const storage = new TransactionObservedStorage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, first, 0);

  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  let digestCalls = 0;
  vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
    digestCalls += 1;
    return originalDigest(...args);
  });

  let winnerResult;
  storage.beforeTransaction = async () => {
    assert.ok(
      digestCalls >= 3,
      "storage-key hashing, retained-chain verification, and next-event hashing must finish before CAS starts",
    );
    winnerResult = await repository.append(candidate, winner, 1);
  };

  await assert.rejects(
    repository.append(candidate, stale, 1),
    /expected history version lost the CAS race/,
  );

  assert.equal(winnerResult?.kind, "accepted");
  assert.equal(winnerResult?.snapshot.version, 2);
  const recovered = await repository.read(candidate);
  assert.equal(recovered?.version, 2);
  assert.equal(recovered?.events.at(-1)?.handoffDigest, winner.handoffDigest);
});
