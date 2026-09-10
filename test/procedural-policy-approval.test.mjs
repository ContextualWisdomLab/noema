import assert from "node:assert/strict";
import { test } from "vitest";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history.ts";
import { ProceduralEvaluationHistoryAuthority } from "../src/state-checkpoint/procedural-evaluation-history-authority.ts";
import {
  DurableProceduralPolicyApprovalRepository,
  assertProceduralPolicyApprovalSnapshot,
} from "../src/policy-approval/procedural-policy-approval.ts";

const digest = (character) => character.repeat(64);

async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function candidateGraph() {
  return createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-policy-cas",
    taskType: "repair",
    graphId: "graph-policy-cas",
    revision: 2,
    parentDigest: digest("a"),
    nodes: ["Start", "verify"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "verify",
      condition: "",
      guidance: "Verify exact policy evidence",
      pitfalls: "",
    }],
  });
}

function evaluationEventMaterial(stream, event) {
  return [
    event.schemaVersion,
    stream.tenantId,
    stream.taskType,
    stream.graphId,
    event.version,
    event.candidateRevision,
    event.baselineDigest,
    event.candidateDigest,
    event.contextDigest,
    event.baselineReceiptDigest,
    event.candidateReceiptDigest,
    event.rejectionKey,
    event.decisionReason,
    event.envelopeDigest,
    event.signerKeyId,
    event.handoffDigest,
    event.issuedAtEpochSeconds,
    event.expiresAtEpochSeconds,
    event.eligibleForApproval,
    event.activationAuthorized,
    event.priorEventDigest,
  ];
}

async function verifiedHistory(candidate) {
  const stream = {
    tenantId: candidate.tenantId,
    taskType: candidate.taskType,
    graphId: candidate.graphId,
  };
  const withoutDigest = {
    schemaVersion: "noema.procedural-evaluation-history-event/v1",
    version: 1,
    candidateRevision: candidate.revision,
    baselineDigest: candidate.parentDigest,
    candidateDigest: candidate.digest,
    contextDigest: digest("c"),
    baselineReceiptDigest: digest("d"),
    candidateReceiptDigest: digest("e"),
    rejectionKey: digest("f"),
    decisionReason: "validation_non_regression",
    envelopeDigest: digest("1"),
    signerKeyId: "keyverse:evaluator/procedural-v1",
    handoffDigest: digest("2"),
    issuedAtEpochSeconds: 1_700_000_000,
    expiresAtEpochSeconds: 1_700_000_120,
    eligibleForApproval: true,
    activationAuthorized: false,
    priorEventDigest: null,
  };
  const event = {
    ...withoutDigest,
    eventDigest: await hash(evaluationEventMaterial(stream, withoutDigest)),
  };
  const keyDigest = await hash([
    "noema.procedural-evaluation-history/v1",
    stream.tenantId,
    stream.taskType,
    stream.graphId,
  ]);
  const retained = {
    schemaVersion: "noema.procedural-evaluation-history/v1",
    stream,
    version: 1,
    headEventDigest: event.eventDigest,
    rejectedKeys: [],
    events: [event],
  };
  const storage = {
    async get(key) {
      return key === `procedural-evaluation-history:v1:${keyDigest}` ? structuredClone(retained) : undefined;
    },
    async put() {},
    async transaction(callback) { return callback(this); },
  };
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);
  const authority = new ProceduralEvaluationHistoryAuthority(repository);
  return authority.read(candidate);
}

function memoryStorage() {
  const records = new Map();
  return {
    records,
    async get(key) {
      const value = records.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      records.set(key, structuredClone(value));
    },
    async transaction(callback) {
      return callback(this);
    },
  };
}

function decisionFrom(request, action, decisionId) {
  return {
    schemaVersion: "noema.procedural-policy-decision/v1",
    decisionId,
    action,
    policyVersion: "policy:procedural/pilot-v1",
    tenantId: request.tenantId,
    taskType: request.taskType,
    graphId: request.graphId,
    candidateDigest: request.candidateDigest,
    historyVersion: request.historyVersion,
    historyHeadEventDigest: request.historyHeadEventDigest,
    envelopeDigest: request.envelopeDigest,
    handoffDigest: request.handoffDigest,
    signerKeyId: request.signerKeyId,
    expectedApprovalVersion: request.expectedApprovalVersion,
  };
}

test("Policy / Approval CAS binds exact graph and verified durable evaluation history", async () => {
  const candidate = await candidateGraph();
  const history = await verifiedHistory(candidate);
  assert.ok(history);

  let action = "approve_for_pilot";
  let decisionId = "decision:approve-1";
  const authority = {
    resolveProceduralPolicyDecision(request) {
      return decisionFrom(request, action, decisionId);
    },
  };
  const storage = memoryStorage();
  const repository = new DurableProceduralPolicyApprovalRepository(storage, authority);

  assert.equal(await repository.read(candidate), null);

  const approved = await repository.append(candidate, history, 0);
  assert.equal(approved.kind, "accepted");
  assert.equal(approved.snapshot.version, 1);
  assert.equal(approved.snapshot.status, "approved_for_pilot");
  assert.equal(approved.snapshot.candidateDigest, candidate.digest);
  assert.equal(approved.snapshot.historyVersion, history.version);
  assert.equal(approved.snapshot.historyHeadEventDigest, history.headEventDigest);
  assert.equal(approved.snapshot.activationAuthorized, false);
  assert.doesNotThrow(() => assertProceduralPolicyApprovalSnapshot(approved.snapshot));
  assert.throws(
    () => assertProceduralPolicyApprovalSnapshot(structuredClone(approved.snapshot)),
    /unadmitted procedural policy approval snapshot/,
  );

  const replay = await repository.append(candidate, history, 0);
  assert.equal(replay.kind, "replay");
  assert.equal(replay.snapshot.version, 1);

  decisionId = "decision:stale-writer";
  await assert.rejects(
    () => repository.append(candidate, history, 0),
    /expected approval version lost the CAS race/,
  );

  action = "revoke";
  decisionId = "decision:revoke-1";
  const revoked = await repository.append(candidate, history, 1);
  assert.equal(revoked.kind, "accepted");
  assert.equal(revoked.snapshot.version, 2);
  assert.equal(revoked.snapshot.status, "revoked");
  assert.equal(revoked.snapshot.activationAuthorized, false);
  assert.doesNotThrow(() => assertProceduralPolicyApprovalSnapshot(revoked.snapshot));

  const restored = await repository.read(candidate);
  assert.ok(restored);
  assert.equal(restored.version, 2);
  assert.equal(restored.status, "revoked");
  assert.doesNotThrow(() => assertProceduralPolicyApprovalSnapshot(restored));
});

test("Policy / Approval fails closed for forged history and absent or malformed authority", async () => {
  const candidate = await candidateGraph();
  const history = await verifiedHistory(candidate);
  assert.ok(history);

  const missingAuthority = new DurableProceduralPolicyApprovalRepository(memoryStorage(), {
    resolveProceduralPolicyDecision() { return null; },
  });
  await assert.rejects(
    () => missingAuthority.append(candidate, history, 0),
    /independent procedural policy decision is required/,
  );

  const throwingAuthority = new DurableProceduralPolicyApprovalRepository(memoryStorage(), {
    resolveProceduralPolicyDecision() { throw new Error("owner unavailable"); },
  });
  await assert.rejects(
    () => throwingAuthority.append(candidate, history, 0),
    /independent procedural policy decision is required/,
  );

  const malformedAuthority = new DurableProceduralPolicyApprovalRepository(memoryStorage(), {
    resolveProceduralPolicyDecision(request) {
      const decision = decisionFrom(request, "approve_for_pilot", "decision:malformed");
      delete decision.policyVersion;
      return decision;
    },
  });
  await assert.rejects(
    () => malformedAuthority.append(candidate, history, 0),
    /independent procedural policy decision is malformed/,
  );

  const mismatchedAuthority = new DurableProceduralPolicyApprovalRepository(memoryStorage(), {
    resolveProceduralPolicyDecision(request) {
      return { ...decisionFrom(request, "approve_for_pilot", "decision:mismatch"), graphId: "graph-other" };
    },
  });
  await assert.rejects(
    () => mismatchedAuthority.append(candidate, history, 0),
    /does not bind the exact request/,
  );

  const authority = {
    resolveProceduralPolicyDecision(request) {
      return decisionFrom(request, "approve_for_pilot", "decision:approve-forgery-test");
    },
  };
  const repository = new DurableProceduralPolicyApprovalRepository(memoryStorage(), authority);
  await assert.rejects(
    () => repository.append(candidate, structuredClone(history), 0),
    /unadmitted durable procedural history snapshot/,
  );
});