import assert from "node:assert/strict";
import { test, vi } from "vitest";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history.ts";
import { ProceduralEvaluationHistoryAuthority } from "../src/state-checkpoint/procedural-evaluation-history-authority.ts";
import {
  DurableProceduralPolicyApprovalRepository,
  ProceduralPolicyApprovalConflictError,
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
    tenantId: "tenant-policy-minimal-transaction",
    taskType: "repair",
    graphId: "graph-policy-minimal-transaction",
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
  return new ProceduralEvaluationHistoryAuthority(repository).read(candidate);
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

function memoryStorage() {
  const records = new Map();
  const storage = {
    records,
    inTransaction: false,
    beforeTransaction: null,
    async get(key) {
      const value = records.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key, value) {
      records.set(key, structuredClone(value));
    },
    async transaction(callback) {
      const hook = storage.beforeTransaction;
      storage.beforeTransaction = null;
      if (hook) await hook();
      storage.inTransaction = true;
      try {
        return await callback(storage);
      } finally {
        storage.inTransaction = false;
      }
    },
  };
  return storage;
}

function approvalValue(storage) {
  const entry = [...storage.records.values()][0];
  assert.ok(entry);
  return entry;
}

function repositoryFor(storage, actionRef, decisionRef) {
  return new DurableProceduralPolicyApprovalRepository(storage, {
    resolveProceduralPolicyDecision(request) {
      return decisionFrom(request, actionRef.value, decisionRef.value);
    },
  });
}

async function approvedFixture() {
  const candidate = await candidateGraph();
  const history = await verifiedHistory(candidate);
  assert.ok(history);
  const storage = memoryStorage();
  const action = { value: "approve_for_pilot" };
  const decision = { value: "decision:approve" };
  const repository = repositoryFor(storage, action, decision);
  await repository.append(candidate, history, 0);
  return { candidate, history, storage, action, decision, repository };
}

function isPolicyConflict(error) {
  return error instanceof ProceduralPolicyApprovalConflictError;
}

test("Policy / Approval performs no SHA-256 work while the durable transaction is active", async () => {
  const fixture = await approvedFixture();
  fixture.action.value = "revoke";
  fixture.decision.value = "decision:revoke";
  const originalDigest = crypto.subtle.digest.bind(crypto.subtle);
  const insideTransaction = [];
  const spy = vi.spyOn(crypto.subtle, "digest").mockImplementation(async (...args) => {
    insideTransaction.push(fixture.storage.inTransaction);
    return originalDigest(...args);
  });
  try {
    const revoked = await fixture.repository.append(fixture.candidate, fixture.history, 1);
    assert.equal(revoked.kind, "accepted");
    assert.ok(insideTransaction.length > 0);
    assert.equal(insideTransaction.some(Boolean), false);
  } finally {
    spy.mockRestore();
  }
});

test("Policy / Approval complete CAS rejects a legal winner inserted after preverification", async () => {
  const fixture = await approvedFixture();
  fixture.action.value = "revoke";
  fixture.decision.value = "decision:stale";
  const winner = new DurableProceduralPolicyApprovalRepository(fixture.storage, {
    resolveProceduralPolicyDecision(request) {
      return decisionFrom(request, "revoke", "decision:winner");
    },
  });
  fixture.storage.beforeTransaction = async () => {
    const accepted = await winner.append(fixture.candidate, fixture.history, 1);
    assert.equal(accepted.kind, "accepted");
  };
  await assert.rejects(
    () => fixture.repository.append(fixture.candidate, fixture.history, 1),
    isPolicyConflict,
  );
  const durable = await winner.read(fixture.candidate);
  assert.ok(durable);
  assert.equal(durable.version, 2);
  assert.equal(durable.events.at(-1).decisionId, "decision:winner");
});

test("Policy / Approval rejects post-verification internal event drift instead of healing it", async () => {
  const fixture = await approvedFixture();
  fixture.action.value = "revoke";
  fixture.decision.value = "decision:stale-internal";
  fixture.storage.beforeTransaction = async () => {
    const retained = approvalValue(fixture.storage);
    retained.events[0].signerKeyId = "keyverse:evaluator/mutated-v1";
  };
  await assert.rejects(
    () => fixture.repository.append(fixture.candidate, fixture.history, 1),
    isPolicyConflict,
  );
  assert.equal(approvalValue(fixture.storage).events[0].signerKeyId, "keyverse:evaluator/mutated-v1");
});

test("Policy / Approval rejects JSON-invisible unknown fields for append and exact replay", async () => {
  for (const replay of [false, true]) {
    const fixture = await approvedFixture();
    fixture.action.value = replay ? "approve_for_pilot" : "revoke";
    fixture.decision.value = replay ? "decision:approve" : "decision:unknown-field";
    fixture.storage.beforeTransaction = async () => {
      approvalValue(fixture.storage).events[0].unknownStructuredCloneField = undefined;
    };
    await assert.rejects(
      () => fixture.repository.append(fixture.candidate, fixture.history, replay ? 0 : 1),
      isPolicyConflict,
    );
  }
});

test("Policy / Approval rejects sparse and compensating retained event arrays at the runtime boundary", async () => {
  const fixture = await approvedFixture();
  const sparse = approvalValue(fixture.storage);
  delete sparse.events[0];
  await assert.rejects(() => fixture.repository.read(fixture.candidate), isPolicyConflict);

  const second = await approvedFixture();
  const compensated = approvalValue(second.storage);
  delete compensated.events[0];
  compensated.events.extra = structuredClone(compensated.events.length);
  await assert.rejects(() => second.repository.read(second.candidate), isPolicyConflict);
});

test("Policy / Approval rejects coercible non-string retained digest and identity values before rehash", async () => {
  const digestFixture = await approvedFixture();
  approvalValue(digestFixture.storage).events[0].eventDigest = BigInt("7".repeat(64));
  await assert.rejects(() => digestFixture.repository.read(digestFixture.candidate), isPolicyConflict);

  const identityFixture = await approvedFixture();
  approvalValue(identityFixture.storage).events[0].decisionId = 123456789;
  await assert.rejects(() => identityFixture.repository.read(identityFixture.candidate), isPolicyConflict);
});

test("Policy / Approval CAS compares event-array cardinality even when the top-level projection is unchanged", async () => {
  const fixture = await approvedFixture();
  fixture.action.value = "revoke";
  fixture.decision.value = "decision:event-array-drift";
  fixture.storage.beforeTransaction = async () => {
    const retained = approvalValue(fixture.storage);
    retained.events.push(structuredClone(retained.events[0]));
  };
  await assert.rejects(
    () => fixture.repository.append(fixture.candidate, fixture.history, 1),
    isPolicyConflict,
  );
});
