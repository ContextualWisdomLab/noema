import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { assessProceduralCandidate } from "../src/agent-runtime/procedural-evolution.ts";
import {
  admitProceduralEvaluationEvidence,
  proceduralEvaluationEvidenceDigest,
} from "../src/agent-runtime/procedural-evaluation-authority.ts";
import { verifyProceduralEvaluationHandoff } from "../src/agent-runtime/procedural-evaluation-handoff.ts";
import {
  DurableProceduralEvaluationHistoryRepository,
  MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS,
} from "../src/state-checkpoint/procedural-evaluation-history.ts";

const digest = (character) => character.repeat(64);

class Storage {
  constructor() {
    this.records = new Map();
  }

  async get(key) {
    const value = this.records.get(key);
    return value === undefined ? undefined : structuredClone(value);
  }

  async put(key, value) {
    this.records.set(key, structuredClone(value));
  }

  async transaction(callback) {
    return callback(this);
  }
}

async function graphs() {
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
  return { baseline, candidate };
}

async function screenedDecision(
  baseline,
  candidate,
  { rejectedKeys = [], candidateScore = 0.8, safetyViolations = 0 } = {},
) {
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
        { caseId: "case-1", score: candidateScore, safetyViolations },
        { caseId: "case-2", score: candidateScore, safetyViolations },
      ],
    },
    rejectedKeys,
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

async function evaluationEvidence(decision) {
  const metadata = authorityInput();
  const expected = await proceduralEvaluationEvidenceDigest(decision, metadata);
  return admitProceduralEvaluationEvidence(decision, metadata, expected);
}

async function keyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"],
  );
}

function canonicalMessage(envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds) {
  return new TextEncoder().encode(JSON.stringify([
    "noema.procedural-evaluation-handoff/v1",
    envelopeDigest,
    signerKeyId,
    issuedAtEpochSeconds,
    expiresAtEpochSeconds,
  ]));
}

async function authenticatedEvaluation(decision, keys, sequence = 0) {
  const evidence = await evaluationEvidence(decision);
  const now = Math.floor(Date.now() / 1000);
  const issuedAtEpochSeconds = now - 130 + sequence;
  const expiresAtEpochSeconds = now + 130;
  const signerKeyId = "keyverse:evaluator/procedural-v1";
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    keys.privateKey,
    canonicalMessage(evidence.envelopeDigest, signerKeyId, issuedAtEpochSeconds, expiresAtEpochSeconds),
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

test("persists an authenticated rejection and reconstructs its exact durable history after restart", async () => {
  const { baseline, candidate } = await graphs();
  const decision = await screenedDecision(baseline, candidate, { safetyViolations: 1 });
  const keys = await keyPair();
  const authenticated = await authenticatedEvaluation(decision, keys);
  const storage = new Storage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  const appended = await repository.append(candidate, authenticated, 0);
  assert.equal(appended.kind, "accepted");
  assert.equal(appended.snapshot.version, 1);
  assert.deepEqual(appended.snapshot.rejectedKeys, [decision.rejectionKey]);
  assert.equal(appended.event.candidateDigest, candidate.digest);
  assert.equal(appended.event.handoffDigest, authenticated.handoffDigest);
  assert.equal(appended.event.activationAuthorized, false);

  const restarted = new DurableProceduralEvaluationHistoryRepository(storage);
  const recovered = await restarted.read(candidate);
  assert.equal(recovered?.version, 1);
  assert.equal(recovered?.events.length, 1);
  assert.equal(recovered?.events[0].decisionReason, "safety_violation");
  assert.deepEqual(recovered?.rejectedKeys, [decision.rejectionKey]);
});

test("returns an exact authenticated replay without consuming a new CAS version", async () => {
  const { baseline, candidate } = await graphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await keyPair();
  const authenticated = await authenticatedEvaluation(decision, keys);
  const repository = new DurableProceduralEvaluationHistoryRepository(new Storage());

  const first = await repository.append(candidate, authenticated, 0);
  const replay = await repository.append(candidate, authenticated, 99);

  assert.equal(first.kind, "accepted");
  assert.equal(replay.kind, "replay");
  assert.equal(replay.snapshot.version, 1);
  assert.equal(replay.event.eventDigest, first.event.eventDigest);
});

test("rejects stale writers and decisions that omit the canonical durable rejection context", async () => {
  const { baseline, candidate } = await graphs();
  const rejected = await screenedDecision(baseline, candidate, { safetyViolations: 1 });
  const eligibleWithoutHistory = await screenedDecision(baseline, candidate);
  const keys = await keyPair();
  const storage = new Storage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await repository.append(candidate, await authenticatedEvaluation(rejected, keys, 0), 0);
  await assert.rejects(
    repository.append(candidate, await authenticatedEvaluation(eligibleWithoutHistory, keys, 1), 1),
    /decision does not reflect durable rejection history/,
  );

  const withHistory = await screenedDecision(baseline, candidate, { rejectedKeys: [rejected.rejectionKey] });
  assert.equal(withHistory.reason, "previously_rejected");
  const accepted = await repository.append(candidate, await authenticatedEvaluation(withHistory, keys, 2), 1);
  assert.equal(accepted.snapshot.version, 2);
  assert.deepEqual(accepted.snapshot.rejectedKeys, [rejected.rejectionKey]);

  const fresh = new DurableProceduralEvaluationHistoryRepository(new Storage());
  await fresh.append(candidate, await authenticatedEvaluation(eligibleWithoutHistory, keys, 3), 0);
  await assert.rejects(
    fresh.append(candidate, await authenticatedEvaluation(eligibleWithoutHistory, keys, 4), 0),
    /expected history version lost the CAS race/,
  );
});

test("refuses unadmitted evaluator objects, wrong graph lineage, and corrupted retained bytes", async () => {
  const { baseline, candidate } = await graphs();
  const decision = await screenedDecision(baseline, candidate, { candidateScore: 0.4 });
  const keys = await keyPair();
  const authenticated = await authenticatedEvaluation(decision, keys);
  const storage = new Storage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await assert.rejects(
    repository.append(candidate, structuredClone(authenticated), 0),
    /unadmitted_authenticated_evaluation/,
  );
  await assert.rejects(
    repository.append(baseline, authenticated, 0),
    /authenticated evaluation does not bind the admitted candidate graph/,
  );
  await assert.rejects(
    repository.append(candidate, authenticated, -1),
    /expected history version is not canonical/,
  );
  assert.equal(await repository.read(candidate), null);

  await repository.append(candidate, authenticated, 0);
  const [key, retained] = storage.records.entries().next().value;
  retained.headEventDigest = digest("f");
  storage.records.set(key, retained);
  await assert.rejects(repository.read(candidate), /durable procedural history integrity check failed/);
});

test("fails closed at the bounded full-history capacity without discarding rejection evidence", async () => {
  const { baseline, candidate } = await graphs();
  const decision = await screenedDecision(baseline, candidate);
  const keys = await keyPair();
  const storage = new Storage();
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  for (let index = 0; index < MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS; index += 1) {
    const authenticated = await authenticatedEvaluation(decision, keys, index);
    const result = await repository.append(candidate, authenticated, index);
    assert.equal(result.snapshot.version, index + 1);
  }

  const before = await repository.read(candidate);
  assert.equal(before?.events.length, MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS);
  await assert.rejects(
    repository.append(
      candidate,
      await authenticatedEvaluation(decision, keys, MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS),
      MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS,
    ),
    /durable procedural history capacity is exhausted/,
  );
  const after = await repository.read(candidate);
  assert.equal(after?.version, before?.version);
  assert.deepEqual(after?.rejectedKeys, before?.rejectedKeys);
});
