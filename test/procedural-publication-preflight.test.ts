import { describe, expect, it } from "vitest";

import { createProceduralGraph, type ProceduralGraph } from "../src/agent-runtime/procedural-graph";
import {
  ProceduralPublicationPreflight,
  assertProceduralPublicationPreflight,
} from "../src/policy-approval/procedural-publication-preflight";
import {
  DurableProceduralPolicyApprovalRepository,
  type ProceduralPolicyApprovalSnapshot,
} from "../src/policy-approval/procedural-policy-approval";
import { DurableProceduralEvaluationHistoryRepository } from "../src/state-checkpoint/procedural-evaluation-history";
import {
  ProceduralEvaluationHistoryAuthority,
  type ProceduralEvaluationHistorySnapshot,
} from "../src/state-checkpoint/procedural-evaluation-history-authority";

const digest = (character: string): string => character.repeat(64);

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(result)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function candidateGraph(): Promise<ProceduralGraph> {
  return createProceduralGraph({
    schemaVersion: "noema.procedural-graph/v1",
    tenantId: "tenant-publication-preflight",
    taskType: "repair",
    graphId: "graph-publication-preflight",
    revision: 2,
    parentDigest: digest("a"),
    nodes: ["Start", "verify"],
    edges: [{
      from: "Start",
      relation: "requires",
      to: "verify",
      condition: "",
      guidance: "Reconcile current owner evidence before publication",
      pitfalls: "Do not treat point-in-time approval as current publication authority",
    }],
  });
}

function evaluationEventMaterial(
  stream: { tenantId: string; taskType: string; graphId: string },
  event: Record<string, unknown>,
): unknown {
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

async function admittedHistory(
  candidate: ProceduralGraph,
  version: 1 | 2 = 1,
): Promise<ProceduralEvaluationHistorySnapshot> {
  const stream = {
    tenantId: candidate.tenantId,
    taskType: candidate.taskType,
    graphId: candidate.graphId,
  };
  const firstWithoutDigest = {
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
  const firstEvent = {
    ...firstWithoutDigest,
    eventDigest: await hash(evaluationEventMaterial(stream, firstWithoutDigest)),
  };
  const events = [firstEvent];
  const rejectedKeys: string[] = [];
  if (version === 2) {
    const secondWithoutDigest = {
      ...firstWithoutDigest,
      version: 2,
      rejectionKey: digest("3"),
      decisionReason: "score_regression",
      envelopeDigest: digest("4"),
      handoffDigest: digest("5"),
      issuedAtEpochSeconds: 1_700_000_121,
      expiresAtEpochSeconds: 1_700_000_241,
      eligibleForApproval: false,
      priorEventDigest: firstEvent.eventDigest,
    };
    const secondEvent = {
      ...secondWithoutDigest,
      eventDigest: await hash(evaluationEventMaterial(stream, secondWithoutDigest)),
    };
    events.push(secondEvent);
    rejectedKeys.push(secondEvent.rejectionKey);
  }
  const keyDigest = await hash([
    "noema.procedural-evaluation-history/v1",
    stream.tenantId,
    stream.taskType,
    stream.graphId,
  ]);
  const retained = {
    schemaVersion: "noema.procedural-evaluation-history/v1",
    stream,
    version: events.length,
    headEventDigest: events.at(-1)!.eventDigest,
    rejectedKeys,
    events,
  };
  const storage = {
    async get(key: string) {
      return key === `procedural-evaluation-history:v1:${keyDigest}` ? structuredClone(retained) : undefined;
    },
    async put() {},
    async transaction<T>(callback: (transaction: typeof storage) => Promise<T>) { return callback(this); },
  };
  const authority = new ProceduralEvaluationHistoryAuthority(
    new DurableProceduralEvaluationHistoryRepository(storage),
  );
  const snapshot = await authority.read(candidate);
  if (snapshot === null) throw new Error("fixture history missing");
  return snapshot;
}

function memoryStorage() {
  const records = new Map<string, unknown>();
  return {
    async get(key: string) {
      const value = records.get(key);
      return value === undefined ? undefined : structuredClone(value);
    },
    async put(key: string, value: unknown) {
      records.set(key, structuredClone(value));
    },
    async transaction<T>(callback: (transaction: ReturnType<typeof memoryStorage>) => Promise<T>) {
      return callback(this);
    },
  };
}

function decisionFrom(
  request: Record<string, unknown>,
  action: "approve_for_pilot" | "revoke",
  decisionId: string,
) {
  return {
    schemaVersion: "noema.procedural-policy-decision/v1" as const,
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

async function admittedApproval(
  candidate: ProceduralGraph,
  history: ProceduralEvaluationHistorySnapshot,
  action: "approve_for_pilot" | "revoke" = "approve_for_pilot",
): Promise<ProceduralPolicyApprovalSnapshot> {
  let currentAction: "approve_for_pilot" | "revoke" = "approve_for_pilot";
  let decisionId = "decision:publication-approve";
  const repository = new DurableProceduralPolicyApprovalRepository(memoryStorage(), {
    resolveProceduralPolicyDecision(request) {
      return decisionFrom(request as unknown as Record<string, unknown>, currentAction, decisionId);
    },
  });
  const approved = await repository.append(candidate, history, 0);
  if (action === "approve_for_pilot") return approved.snapshot;
  currentAction = "revoke";
  decisionId = "decision:publication-revoke";
  const revoked = await repository.append(candidate, history, 1);
  return revoked.snapshot;
}

function sequenceReader<T>(values: readonly T[]) {
  const queue = [...values];
  return {
    async read() {
      const next = queue.shift();
      if (next === undefined) throw new Error("unexpected extra authority read");
      return next;
    },
  };
}

describe("procedural publication preflight", () => {
  it("freshly reconciles stable State / Checkpoint and Policy / Approval identities without granting publication", async () => {
    const candidate = await candidateGraph();
    const history = await admittedHistory(candidate);
    const approval = await admittedApproval(candidate, history);
    const preflight = new ProceduralPublicationPreflight(
      sequenceReader([history, history]),
      sequenceReader([approval, approval]),
    );

    const receipt = await preflight.reconcile(candidate);

    expect(receipt).toMatchObject({
      schemaVersion: "noema.procedural-publication-preflight/v1",
      tenantId: candidate.tenantId,
      taskType: candidate.taskType,
      graphId: candidate.graphId,
      candidateDigest: candidate.digest,
      historyVersion: history.version,
      historyHeadEventDigest: history.headEventDigest,
      approvalVersion: approval.version,
      approvalHeadEventDigest: approval.headEventDigest,
      approvalStatus: "approved_for_pilot",
      publicationAuthorized: false,
      activationAuthorized: false,
    });
    expect(() => assertProceduralPublicationPreflight(receipt)).not.toThrow();
    expect(() => assertProceduralPublicationPreflight(structuredClone(receipt))).toThrow(
      /unadmitted procedural publication preflight/,
    );
  });

  it("fails closed when current evaluation history advances after the approval snapshot", async () => {
    const candidate = await candidateGraph();
    const approvedHistory = await admittedHistory(candidate, 1);
    const currentHistory = await admittedHistory(candidate, 2);
    const approval = await admittedApproval(candidate, approvedHistory);
    const preflight = new ProceduralPublicationPreflight(
      sequenceReader([approvedHistory, currentHistory]),
      sequenceReader([approval]),
    );

    await expect(preflight.reconcile(candidate)).rejects.toMatchObject({
      name: "ProceduralPublicationPreflightError",
      code: "authority_changed_during_reconciliation",
    });
  });

  it("fails closed when Policy / Approval changes during the stable-read window", async () => {
    const candidate = await candidateGraph();
    const history = await admittedHistory(candidate);
    const approved = await admittedApproval(candidate, history);
    const revoked = await admittedApproval(candidate, history, "revoke");
    const preflight = new ProceduralPublicationPreflight(
      sequenceReader([history, history]),
      sequenceReader([approved, revoked]),
    );

    await expect(preflight.reconcile(candidate)).rejects.toMatchObject({
      name: "ProceduralPublicationPreflightError",
      code: "authority_changed_during_reconciliation",
    });
  });

  it("rejects current revocation and structurally forged owner snapshots", async () => {
    const candidate = await candidateGraph();
    const history = await admittedHistory(candidate);
    const revoked = await admittedApproval(candidate, history, "revoke");
    const revokedPreflight = new ProceduralPublicationPreflight(
      sequenceReader([history, history]),
      sequenceReader([revoked, revoked]),
    );
    await expect(revokedPreflight.reconcile(candidate)).rejects.toMatchObject({
      name: "ProceduralPublicationPreflightError",
      code: "approval_revoked",
    });

    const approved = await admittedApproval(candidate, history);
    const forgedHistory = structuredClone(history);
    const forgedPreflight = new ProceduralPublicationPreflight(
      sequenceReader([forgedHistory, forgedHistory]),
      sequenceReader([approved, approved]),
    );
    await expect(forgedPreflight.reconcile(candidate)).rejects.toThrow(
      /unadmitted durable procedural history snapshot/,
    );
  });
});
