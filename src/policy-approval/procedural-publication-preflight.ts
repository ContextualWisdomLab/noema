import {
  assertProceduralGraph,
  type ProceduralGraph,
} from "../agent-runtime/procedural-graph";
import type {
  ProceduralEvaluationHistorySnapshot,
} from "../state-checkpoint/procedural-evaluation-history";
import {
  assertProceduralEvaluationHistorySnapshot,
} from "../state-checkpoint/procedural-evaluation-history-authority";
import {
  assertProceduralPolicyApprovalSnapshot,
  type ProceduralPolicyApprovalSnapshot,
} from "./procedural-policy-approval";

const PREFLIGHT_SCHEMA_VERSION = "noema.procedural-publication-preflight/v1" as const;
const admittedPreflights = new WeakSet<object>();

/**
 * State / Checkpoint read port used only to obtain current durable procedural evaluation history.
 * Implementations retain storage ownership; this composition boundary never writes that state.
 */
export interface ProceduralPublicationHistoryReader {
  /**
   * Reads the current verified State / Checkpoint snapshot for the exact admitted graph lineage.
   * @param candidate Locally admitted procedural graph whose lineage selects the current history.
   * @returns A provenance-bearing current snapshot, or null when no durable history exists.
   */
  read(candidate: ProceduralGraph): Promise<ProceduralEvaluationHistorySnapshot | null>;
}

/**
 * Policy / Approval read port used only to obtain current durable procedural approval state.
 * Implementations retain policy ownership; this composition boundary never mints a decision.
 */
export interface ProceduralPublicationApprovalReader {
  /**
   * Reads the current verified Policy / Approval snapshot for the exact admitted graph lineage.
   * @param candidate Locally admitted procedural graph whose lineage selects the approval ledger.
   * @returns A provenance-bearing current snapshot, or null when no approval state exists.
   */
  read(candidate: ProceduralGraph): Promise<ProceduralPolicyApprovalSnapshot | null>;
}

/** Stable diagnostic codes for publication-preflight reconciliation failures; none grants retry authority. */
export type ProceduralPublicationPreflightErrorCode =
  | "history_unavailable"
  | "approval_unavailable"
  | "authority_changed_during_reconciliation"
  | "approval_revoked"
  | "approval_does_not_match_current_history"
  | "unadmitted_preflight";

/**
 * Fail-closed error emitted when current owner evidence cannot establish one stable publication precondition.
 * The error is diagnostic only and cannot publish, activate, approve, retry, or mutate a procedural graph.
 */
export class ProceduralPublicationPreflightError extends Error {
  readonly code: ProceduralPublicationPreflightErrorCode;

  /**
   * Creates one stable failure classification without carrying owner secrets or mutable evidence payloads.
   * @param code Canonical failure class produced by the reconciliation boundary.
   */
  constructor(code: ProceduralPublicationPreflightErrorCode) {
    super(code);
    this.name = "ProceduralPublicationPreflightError";
    this.code = code;
  }
}

/**
 * Point-in-time evidence that current State / Checkpoint and Policy / Approval snapshots agreed across
 * one stable-read window. It is deliberately not graph publication, deployment, or activation authority.
 */
export interface ProceduralPublicationPreflightReceipt {
  readonly schemaVersion: typeof PREFLIGHT_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
  readonly candidateRevision: number;
  readonly candidateDigest: string;
  readonly historyVersion: number;
  readonly historyHeadEventDigest: string;
  readonly evaluationEnvelopeDigest: string;
  readonly evaluatorHandoffDigest: string;
  readonly signerKeyId: string;
  readonly approvalVersion: number;
  readonly approvalHeadEventDigest: string;
  readonly approvalDecisionId: string;
  readonly policyVersion: string;
  readonly approvalStatus: "approved_for_pilot";
  readonly publicationAuthorized: false;
  readonly activationAuthorized: false;
}

function rejectPreflight(code: ProceduralPublicationPreflightErrorCode): never {
  throw new ProceduralPublicationPreflightError(code);
}

async function currentHistory(
  reader: ProceduralPublicationHistoryReader,
  candidate: ProceduralGraph,
): Promise<ProceduralEvaluationHistorySnapshot> {
  const snapshot = await reader.read(candidate);
  if (snapshot === null) rejectPreflight("history_unavailable");
  assertProceduralEvaluationHistorySnapshot(snapshot);
  return snapshot;
}

async function currentApproval(
  reader: ProceduralPublicationApprovalReader,
  candidate: ProceduralGraph,
): Promise<ProceduralPolicyApprovalSnapshot> {
  const snapshot = await reader.read(candidate);
  if (snapshot === null) rejectPreflight("approval_unavailable");
  assertProceduralPolicyApprovalSnapshot(snapshot);
  return snapshot;
}

function sameHistoryPosition(
  before: ProceduralEvaluationHistorySnapshot,
  after: ProceduralEvaluationHistorySnapshot,
): boolean {
  return JSON.stringify([
    before.stream.tenantId,
    before.stream.taskType,
    before.stream.graphId,
    before.version,
    before.headEventDigest,
  ]) === JSON.stringify([
    after.stream.tenantId,
    after.stream.taskType,
    after.stream.graphId,
    after.version,
    after.headEventDigest,
  ]);
}

function sameApprovalPosition(
  before: ProceduralPolicyApprovalSnapshot,
  after: ProceduralPolicyApprovalSnapshot,
): boolean {
  return JSON.stringify([
    before.tenantId,
    before.taskType,
    before.graphId,
    before.version,
    before.status,
    before.candidateDigest,
    before.historyVersion,
    before.historyHeadEventDigest,
    before.policyVersion,
    before.headEventDigest,
  ]) === JSON.stringify([
    after.tenantId,
    after.taskType,
    after.graphId,
    after.version,
    after.status,
    after.candidateDigest,
    after.historyVersion,
    after.historyHeadEventDigest,
    after.policyVersion,
    after.headEventDigest,
  ]);
}

function approvalMatchesCurrentHistory(
  candidate: ProceduralGraph,
  history: ProceduralEvaluationHistorySnapshot,
  approval: ProceduralPolicyApprovalSnapshot,
): boolean {
  const evaluation = history.events.at(-1)!;
  const approvalEvent = approval.events.at(-1)!;
  return JSON.stringify([
    approval.tenantId,
    approval.taskType,
    approval.graphId,
    approval.candidateDigest,
    approval.historyVersion,
    approval.historyHeadEventDigest,
    approvalEvent.envelopeDigest,
    approvalEvent.handoffDigest,
    approvalEvent.signerKeyId,
  ]) === JSON.stringify([
    candidate.tenantId,
    candidate.taskType,
    candidate.graphId,
    candidate.digest,
    history.version,
    history.headEventDigest,
    evaluation.envelopeDigest,
    evaluation.handoffDigest,
    evaluation.signerKeyId,
  ]);
}

/**
 * Policy / Approval anti-corruption boundary that reconciles existing owner snapshots immediately before
 * a later publisher acts. It performs no publication itself and introduces no new durable source of truth.
 */
export class ProceduralPublicationPreflight {
  constructor(
    private readonly historyReader: ProceduralPublicationHistoryReader,
    private readonly approvalReader: ProceduralPublicationApprovalReader,
  ) {}

  /**
   * Reads current State / Checkpoint and Policy / Approval twice, rejecting concurrent drift, revocation,
   * or exact identity mismatch. The successful receipt is only a point-in-time precondition: authority can
   * change after return, so an actual publisher must bind the exact receipt to its own atomic/CAS operation
   * and to released external contract/trust inputs. Existing execution lifecycle and cancellation checks stay
   * in Agent Runtime/Workflow boundaries rather than being duplicated as graph-publication truth here.
   * @param candidate Locally admitted candidate graph proposed for a later publication operation.
   * @returns A locally admitted immutable receipt that explicitly carries no publication or activation authority.
   */
  async reconcile(candidate: ProceduralGraph): Promise<ProceduralPublicationPreflightReceipt> {
    assertProceduralGraph(candidate);

    const historyBefore = await currentHistory(this.historyReader, candidate);
    const approvalBefore = await currentApproval(this.approvalReader, candidate);
    const historyAfter = await currentHistory(this.historyReader, candidate);
    if (!sameHistoryPosition(historyBefore, historyAfter)) {
      rejectPreflight("authority_changed_during_reconciliation");
    }

    const approvalAfter = await currentApproval(this.approvalReader, candidate);
    if (!sameApprovalPosition(approvalBefore, approvalAfter)) {
      rejectPreflight("authority_changed_during_reconciliation");
    }
    if (approvalAfter.status === "revoked") rejectPreflight("approval_revoked");
    if (!approvalMatchesCurrentHistory(candidate, historyAfter, approvalAfter)) {
      rejectPreflight("approval_does_not_match_current_history");
    }

    const evaluation = historyAfter.events.at(-1)!;
    const approvalEvent = approvalAfter.events.at(-1)!;
    const receipt: ProceduralPublicationPreflightReceipt = Object.freeze({
      schemaVersion: PREFLIGHT_SCHEMA_VERSION,
      tenantId: candidate.tenantId,
      taskType: candidate.taskType,
      graphId: candidate.graphId,
      candidateRevision: candidate.revision,
      candidateDigest: candidate.digest,
      historyVersion: historyAfter.version,
      historyHeadEventDigest: historyAfter.headEventDigest,
      evaluationEnvelopeDigest: evaluation.envelopeDigest,
      evaluatorHandoffDigest: evaluation.handoffDigest,
      signerKeyId: evaluation.signerKeyId,
      approvalVersion: approvalAfter.version,
      approvalHeadEventDigest: approvalAfter.headEventDigest,
      approvalDecisionId: approvalEvent.decisionId,
      policyVersion: approvalAfter.policyVersion,
      approvalStatus: "approved_for_pilot",
      publicationAuthorized: false,
      activationAuthorized: false,
    });
    admittedPreflights.add(receipt);
    return receipt;
  }
}

/**
 * Requires process-local provenance from `ProceduralPublicationPreflight.reconcile`; serialized or
 * caller-constructed lookalikes cannot be promoted into a downstream publication precondition.
 * @param value Unknown candidate receipt proposed to a later graph-publication adapter.
 * @returns Nothing; normal return means this process emitted the receipt after current-owner reconciliation.
 */
export function assertProceduralPublicationPreflight(
  value: unknown,
): asserts value is ProceduralPublicationPreflightReceipt {
  if (!admittedPreflights.has(value as object)) {
    throw new ProceduralPublicationPreflightError("unadmitted_preflight");
  }
}
