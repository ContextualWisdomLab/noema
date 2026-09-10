import assert from "node:assert/strict";
import { test } from "vitest";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history.ts";
import {
  ProceduralEvaluationHistoryAuthority,
  assertProceduralEvaluationHistorySnapshot,
} from "../src/state-checkpoint/procedural-evaluation-history-authority.ts";

const digest = (character) => character.repeat(64);

async function hash(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function admittedCandidate() {
  return createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-policy",
    taskType: "repair",
    graphId: "graph-policy",
    revision: 2,
    parentDigest: digest("a"),
    nodes: ["Start", "verify"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "verify",
      condition: "",
      guidance: "Verify retained authority",
      pitfalls: "",
    }],
  });
}

function eventMaterial(stream, event) {
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

async function retainedHistory(candidate) {
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
    eventDigest: await hash(eventMaterial(stream, withoutDigest)),
  };
  const keyDigest = await hash([
    "noema.procedural-evaluation-history/v1",
    stream.tenantId,
    stream.taskType,
    stream.graphId,
  ]);
  return {
    key: `procedural-evaluation-history:v1:${keyDigest}`,
    value: {
      schemaVersion: "noema.procedural-evaluation-history/v1",
      stream,
      version: 1,
      headEventDigest: event.eventDigest,
      rejectedKeys: [],
      events: [event],
    },
  };
}

test("only freshly repository-verified history snapshots carry State / Checkpoint authority", async () => {
  const candidate = await admittedCandidate();
  const retained = await retainedHistory(candidate);
  const storage = {
    async get(key) {
      return key === retained.key ? structuredClone(retained.value) : undefined;
    },
    async put() {},
    async transaction(callback) {
      return callback(this);
    },
  };
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);
  const authority = new ProceduralEvaluationHistoryAuthority(repository);
  const snapshot = await authority.read(candidate);

  assert.ok(snapshot);
  assert.doesNotThrow(() => assertProceduralEvaluationHistorySnapshot(snapshot));
  assert.throws(
    () => assertProceduralEvaluationHistorySnapshot(structuredClone(snapshot)),
    /unadmitted durable procedural history snapshot/,
  );
  assert.throws(
    () => assertProceduralEvaluationHistorySnapshot("forged"),
    /unadmitted durable procedural history snapshot/,
  );
  assert.throws(
    () => assertProceduralEvaluationHistorySnapshot(null),
    /unadmitted durable procedural history snapshot/,
  );

  const emptyRepository = new DurableProceduralEvaluationHistoryRepository({
    async get() { return undefined; },
    async put() {},
    async transaction(callback) { return callback(this); },
  });
  const emptyAuthority = new ProceduralEvaluationHistoryAuthority(emptyRepository);
  assert.equal(await emptyAuthority.read(candidate), null);
});
