import { test } from "vitest";
import assert from "node:assert/strict";
import { createProceduralGraph } from "../src/agent-runtime/procedural-graph.ts";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history.ts";

const digest = (character) => character.repeat(64);

test("normalizes retained BigInt digest corruption before cryptographic rehash", async () => {
  const graph = await createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-runtime-untrusted-digest",
    taskType: "repair",
    graphId: "graph-runtime-untrusted-digest",
    revision: 1,
    parentDigest: null,
    nodes: ["Start"],
    edges: [],
  });
  const eventDigest = digest("e");
  const retained = {
    schemaVersion: "noema.procedural-evaluation-history/v1",
    stream: {
      tenantId: graph.tenantId,
      taskType: graph.taskType,
      graphId: graph.graphId,
    },
    version: 1,
    headEventDigest: eventDigest,
    rejectedKeys: [],
    events: [{
      schemaVersion: "noema.procedural-evaluation-history-event/v1",
      version: 1,
      candidateRevision: 2,
      baselineDigest: BigInt("1".repeat(64)),
      candidateDigest: digest("a"),
      contextDigest: digest("b"),
      baselineReceiptDigest: digest("c"),
      candidateReceiptDigest: digest("d"),
      rejectionKey: digest("f"),
      decisionReason: "validation_non_regression",
      envelopeDigest: digest("1"),
      signerKeyId: "keyverse:evaluator/procedural-v1",
      handoffDigest: digest("2"),
      issuedAtEpochSeconds: 1,
      expiresAtEpochSeconds: 2,
      eligibleForApproval: true,
      activationAuthorized: false,
      priorEventDigest: null,
      eventDigest,
    }],
  };
  const storage = {
    get: async () => structuredClone(retained),
    put: async () => { throw new Error("unexpected put"); },
    transaction: async () => { throw new Error("unexpected transaction"); },
  };
  const repository = new DurableProceduralEvaluationHistoryRepository(storage);

  await assert.rejects(
    repository.read(graph),
    (error) => {
      assert.equal(error?.name, "ProceduralEvaluationHistoryConflictError");
      assert.match(error?.message ?? "", /durable procedural history integrity check failed/);
      return true;
    },
  );
});
