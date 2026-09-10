import {
  assertProceduralGraph,
  type ProceduralGraph,
} from "../agent-runtime/procedural-graph";
import {
  assertProceduralEvaluationHistorySnapshot,
} from "../state-checkpoint/procedural-evaluation-history-authority";
import type {
  ProceduralEvaluationHistorySnapshot,
} from "../state-checkpoint/procedural-evaluation-history";

const APPROVAL_SCHEMA_VERSION = "noema.procedural-policy-approval/v1" as const;
const DECISION_SCHEMA_VERSION = "noema.procedural-policy-decision/v1" as const;
const EVENT_SCHEMA_VERSION = "noema.procedural-policy-approval-event/v1" as const;
const MAX_PROCEDURAL_POLICY_APPROVAL_EVENTS = 128;
const SHA256 = /^[0-9a-f]{64}$/u;
const IDENTITY = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;

/** Exact request exposed to Noema's independently composed Policy / Approval authority. */
export interface ProceduralPolicyDecisionRequest {
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
  readonly candidateDigest: string;
  readonly historyVersion: number;
  readonly historyHeadEventDigest: string;
  readonly envelopeDigest: string;
  readonly handoffDigest: string;
  readonly signerKeyId: string;
  readonly expectedApprovalVersion: number;
}

/**
 * Independent Noema Policy / Approval decision bound to one exact graph and verified State / Checkpoint
 * history position. The decision may admit a pilot or revoke it; neither action grants activation.
 */
export interface TrustedProceduralPolicyDecision extends ProceduralPolicyDecisionRequest {
  readonly schemaVersion: typeof DECISION_SCHEMA_VERSION;
  readonly decisionId: string;
  readonly action: "approve_for_pilot" | "revoke";
  readonly policyVersion: string;
}

/**
 * Composition-root port for current Noema Policy / Approval truth. Implementations remain responsible
 * for independent policy authority; this boundary only consumes one exact decision and never mints it.
 */
export interface ProceduralPolicyDecisionAuthority {
  /**
   * Resolves an independently authorized decision for the exact request without transferring identity,
   * key-custody, provider-routing, publication, or activation ownership into this repository.
   * @param request Exact graph/history/CAS position proposed for a policy decision.
   * @returns A matching trusted decision, or null when independent approval is absent or revoked.
   */
  resolveProceduralPolicyDecision(
    request: Readonly<ProceduralPolicyDecisionRequest>,
  ): TrustedProceduralPolicyDecision | null;
}

/**
 * Immutable Policy / Approval CAS event binding one independent decision to the exact candidate graph,
 * verified evaluation-history position, evaluator handoff identity, and previous approval event digest.
 */
export interface ProceduralPolicyApprovalEvent {
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly version: number;
  readonly decisionId: string;
  readonly action: TrustedProceduralPolicyDecision["action"];
  readonly policyVersion: string;
  readonly candidateDigest: string;
  readonly historyVersion: number;
  readonly historyHeadEventDigest: string;
  readonly envelopeDigest: string;
  readonly handoffDigest: string;
  readonly signerKeyId: string;
  readonly expectedApprovalVersion: number;
  readonly status: "approved_for_pilot" | "revoked";
  readonly activationAuthorized: false;
  readonly priorEventDigest: string | null;
  readonly eventDigest: string;
}

/** Verified immutable point-in-time Policy / Approval snapshot for one procedural graph lineage. */
export interface ProceduralPolicyApprovalSnapshot {
  readonly schemaVersion: typeof APPROVAL_SCHEMA_VERSION;
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
  readonly version: number;
  readonly status: "approved_for_pilot" | "revoked";
  readonly candidateDigest: string;
  readonly historyVersion: number;
  readonly historyHeadEventDigest: string;
  readonly policyVersion: string;
  readonly headEventDigest: string;
  readonly activationAuthorized: false;
  readonly events: readonly ProceduralPolicyApprovalEvent[];
}

/** Result of one approval CAS append, distinguishing a new winner from exact idempotent replay. */
export interface ProceduralPolicyApprovalAppendResult {
  readonly kind: "accepted" | "replay";
  readonly event: ProceduralPolicyApprovalEvent;
  readonly snapshot: ProceduralPolicyApprovalSnapshot;
}

/** Raised when procedural Policy / Approval provenance, semantics, or CAS state fails closed. */
export class ProceduralPolicyApprovalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProceduralPolicyApprovalConflictError";
  }
}

type MutableApproval = {
  schemaVersion: typeof APPROVAL_SCHEMA_VERSION;
  tenantId: string;
  taskType: string;
  graphId: string;
  version: number;
  status: "approved_for_pilot" | "revoked";
  candidateDigest: string;
  historyVersion: number;
  historyHeadEventDigest: string;
  policyVersion: string;
  headEventDigest: string;
  activationAuthorized: false;
  events: ProceduralPolicyApprovalEvent[];
};

type ApprovalStorage = Pick<DurableObjectStorage, "get" | "put" | "transaction">;
type ApprovalTransaction = Pick<DurableObjectTransaction, "get" | "put">;

const admittedApprovalSnapshots = new WeakSet<object>();

function rejectApproval(message: string): never {
  throw new ProceduralPolicyApprovalConflictError(message);
}

function requireApproval(condition: boolean, message: string): asserts condition {
  if (!condition) rejectApproval(message);
}

function requireIdentity(value: unknown, label: string): string {
  requireApproval(typeof value === "string" && IDENTITY.test(value), `${label} is not canonical`);
  return value;
}

function requireDigest(value: unknown, label: string): string {
  requireApproval(typeof value === "string" && SHA256.test(value), `${label} is not canonical`);
  return value;
}

function requireVersion(value: unknown, label: string): number {
  requireApproval(
    typeof value === "number"
      && Number.isSafeInteger(value)
      && value >= 0
      && value <= MAX_PROCEDURAL_POLICY_APPROVAL_EVENTS,
    `${label} is not canonical`,
  );
  return value;
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function storageKey(candidate: ProceduralGraph): Promise<string> {
  return `procedural-policy-approval:v1:${await sha256([
    APPROVAL_SCHEMA_VERSION,
    candidate.tenantId,
    candidate.taskType,
    candidate.graphId,
  ])}`;
}

function exactRecord(input: unknown, keys: readonly string[]): Record<string, unknown> {
  requireApproval(input !== null && typeof input === "object" && !Array.isArray(input), "independent procedural policy decision is malformed");
  const proto = Object.getPrototypeOf(input);
  requireApproval(proto === Object.prototype || proto === null, "independent procedural policy decision is malformed");
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const actual = Reflect.ownKeys(descriptors);
  requireApproval(
    actual.length === keys.length
      && actual.every((key) => typeof key === "string" && keys.includes(key)),
    "independent procedural policy decision is malformed",
  );
  const record: Record<string, unknown> = Object.create(null);
  for (const key of keys) {
    const descriptor = descriptors[key];
    requireApproval(
      descriptor !== undefined && Object.hasOwn(descriptor, "value"),
      "independent procedural policy decision is malformed",
    );
    record[key] = descriptor.value;
  }
  return record;
}

function snapshotDecision(input: unknown): TrustedProceduralPolicyDecision {
  const value = exactRecord(input, [
    "schemaVersion",
    "decisionId",
    "action",
    "policyVersion",
    "tenantId",
    "taskType",
    "graphId",
    "candidateDigest",
    "historyVersion",
    "historyHeadEventDigest",
    "envelopeDigest",
    "handoffDigest",
    "signerKeyId",
    "expectedApprovalVersion",
  ]);
  requireApproval(value.schemaVersion === DECISION_SCHEMA_VERSION, "independent procedural policy decision is malformed");
  requireApproval(
    value.action === "approve_for_pilot" || value.action === "revoke",
    "independent procedural policy decision is malformed",
  );
  return Object.freeze({
    schemaVersion: DECISION_SCHEMA_VERSION,
    decisionId: requireIdentity(value.decisionId, "decision id"),
    action: value.action,
    policyVersion: requireIdentity(value.policyVersion, "policy version"),
    tenantId: requireIdentity(value.tenantId, "tenant id"),
    taskType: requireIdentity(value.taskType, "task type"),
    graphId: requireIdentity(value.graphId, "graph id"),
    candidateDigest: requireDigest(value.candidateDigest, "candidate digest"),
    historyVersion: requireVersion(value.historyVersion, "history version"),
    historyHeadEventDigest: requireDigest(value.historyHeadEventDigest, "history head event digest"),
    envelopeDigest: requireDigest(value.envelopeDigest, "envelope digest"),
    handoffDigest: requireDigest(value.handoffDigest, "handoff digest"),
    signerKeyId: requireIdentity(value.signerKeyId, "signer key id"),
    expectedApprovalVersion: requireVersion(value.expectedApprovalVersion, "expected approval version"),
  });
}

function decisionMatchesRequest(
  decision: TrustedProceduralPolicyDecision,
  request: ProceduralPolicyDecisionRequest,
): boolean {
  return decision.tenantId === request.tenantId
    && decision.taskType === request.taskType
    && decision.graphId === request.graphId
    && decision.candidateDigest === request.candidateDigest
    && decision.historyVersion === request.historyVersion
    && decision.historyHeadEventDigest === request.historyHeadEventDigest
    && decision.envelopeDigest === request.envelopeDigest
    && decision.handoffDigest === request.handoffDigest
    && decision.signerKeyId === request.signerKeyId
    && decision.expectedApprovalVersion === request.expectedApprovalVersion;
}

function eventHashMaterial(
  candidate: ProceduralGraph,
  event: Omit<ProceduralPolicyApprovalEvent, "eventDigest">,
): unknown {
  return [
    event.schemaVersion,
    candidate.tenantId,
    candidate.taskType,
    candidate.graphId,
    event.version,
    event.decisionId,
    event.action,
    event.policyVersion,
    event.candidateDigest,
    event.historyVersion,
    event.historyHeadEventDigest,
    event.envelopeDigest,
    event.handoffDigest,
    event.signerKeyId,
    event.expectedApprovalVersion,
    event.status,
    event.activationAuthorized,
    event.priorEventDigest,
  ];
}

function frozenSnapshot(approval: MutableApproval): ProceduralPolicyApprovalSnapshot {
  const snapshot = Object.freeze({
    schemaVersion: approval.schemaVersion,
    tenantId: approval.tenantId,
    taskType: approval.taskType,
    graphId: approval.graphId,
    version: approval.version,
    status: approval.status,
    candidateDigest: approval.candidateDigest,
    historyVersion: approval.historyVersion,
    historyHeadEventDigest: approval.historyHeadEventDigest,
    policyVersion: approval.policyVersion,
    headEventDigest: approval.headEventDigest,
    activationAuthorized: false as const,
    events: Object.freeze(approval.events.map((event) => Object.freeze({ ...event }))),
  });
  admittedApprovalSnapshots.add(snapshot);
  return snapshot;
}

async function verifyStoredApproval(
  input: unknown,
  candidate: ProceduralGraph,
): Promise<MutableApproval> {
  requireApproval(input !== null && typeof input === "object" && !Array.isArray(input), "durable procedural policy approval integrity check failed");
  const approval = input as MutableApproval;
  requireApproval(approval.schemaVersion === APPROVAL_SCHEMA_VERSION, "durable procedural policy approval integrity check failed");
  requireApproval(approval.tenantId === candidate.tenantId, "durable procedural policy approval integrity check failed");
  requireApproval(approval.taskType === candidate.taskType, "durable procedural policy approval integrity check failed");
  requireApproval(approval.graphId === candidate.graphId, "durable procedural policy approval integrity check failed");
  requireApproval(Number.isSafeInteger(approval.version) && approval.version >= 1, "durable procedural policy approval integrity check failed");
  requireApproval(approval.version <= MAX_PROCEDURAL_POLICY_APPROVAL_EVENTS, "durable procedural policy approval integrity check failed");
  requireApproval(Array.isArray(approval.events) && approval.events.length === approval.version, "durable procedural policy approval integrity check failed");
  requireApproval(approval.activationAuthorized === false, "durable procedural policy approval integrity check failed");

  let priorEventDigest: string | null = null;
  let expectedStatus: MutableApproval["status"] | null = null;
  const decisions = new Set<string>();
  for (let index = 0; index < approval.events.length; index += 1) {
    const event = approval.events[index];
    requireApproval(event !== null && typeof event === "object", "durable procedural policy approval integrity check failed");
    requireApproval(event.schemaVersion === EVENT_SCHEMA_VERSION, "durable procedural policy approval integrity check failed");
    requireApproval(event.version === index + 1, "durable procedural policy approval integrity check failed");
    requireApproval(IDENTITY.test(event.decisionId), "durable procedural policy approval integrity check failed");
    requireApproval(!decisions.has(event.decisionId), "durable procedural policy approval integrity check failed");
    decisions.add(event.decisionId);
    requireApproval(event.action === "approve_for_pilot" || event.action === "revoke", "durable procedural policy approval integrity check failed");
    requireApproval(IDENTITY.test(event.policyVersion), "durable procedural policy approval integrity check failed");
    requireApproval(SHA256.test(event.candidateDigest), "durable procedural policy approval integrity check failed");
    requireApproval(Number.isSafeInteger(event.historyVersion) && event.historyVersion >= 1, "durable procedural policy approval integrity check failed");
    requireApproval(SHA256.test(event.historyHeadEventDigest), "durable procedural policy approval integrity check failed");
    requireApproval(SHA256.test(event.envelopeDigest), "durable procedural policy approval integrity check failed");
    requireApproval(SHA256.test(event.handoffDigest), "durable procedural policy approval integrity check failed");
    requireApproval(IDENTITY.test(event.signerKeyId), "durable procedural policy approval integrity check failed");
    requireApproval(event.expectedApprovalVersion === index, "durable procedural policy approval integrity check failed");
    requireApproval(event.activationAuthorized === false, "durable procedural policy approval integrity check failed");
    requireApproval(event.priorEventDigest === priorEventDigest, "durable procedural policy approval integrity check failed");
    requireApproval(SHA256.test(event.eventDigest), "durable procedural policy approval integrity check failed");
    requireApproval(event.eventDigest === await sha256(eventHashMaterial(candidate, event)), "durable procedural policy approval integrity check failed");
    if (event.action === "approve_for_pilot") {
      requireApproval(expectedStatus !== "approved_for_pilot", "durable procedural policy approval integrity check failed");
      expectedStatus = "approved_for_pilot";
    } else {
      requireApproval(expectedStatus === "approved_for_pilot", "durable procedural policy approval integrity check failed");
      expectedStatus = "revoked";
    }
    requireApproval(event.status === expectedStatus, "durable procedural policy approval integrity check failed");
    priorEventDigest = event.eventDigest;
  }
  const latest = approval.events.at(-1);
  requireApproval(latest !== undefined, "durable procedural policy approval integrity check failed");
  requireApproval(approval.status === expectedStatus, "durable procedural policy approval integrity check failed");
  requireApproval(approval.candidateDigest === latest.candidateDigest, "durable procedural policy approval integrity check failed");
  requireApproval(approval.historyVersion === latest.historyVersion, "durable procedural policy approval integrity check failed");
  requireApproval(approval.historyHeadEventDigest === latest.historyHeadEventDigest, "durable procedural policy approval integrity check failed");
  requireApproval(approval.policyVersion === latest.policyVersion, "durable procedural policy approval integrity check failed");
  requireApproval(approval.headEventDigest === latest.eventDigest, "durable procedural policy approval integrity check failed");
  return approval;
}

function requestFrom(
  candidate: ProceduralGraph,
  history: ProceduralEvaluationHistorySnapshot,
  expectedApprovalVersion: number,
): ProceduralPolicyDecisionRequest {
  requireApproval(history.stream.tenantId === candidate.tenantId, "verified procedural history does not bind the candidate graph");
  requireApproval(history.stream.taskType === candidate.taskType, "verified procedural history does not bind the candidate graph");
  requireApproval(history.stream.graphId === candidate.graphId, "verified procedural history does not bind the candidate graph");
  requireApproval(history.version >= 1 && history.events.length === history.version, "verified procedural history is empty or inconsistent");
  const latest = history.events.at(-1);
  requireApproval(latest !== undefined, "verified procedural history is empty or inconsistent");
  requireApproval(latest.candidateRevision === candidate.revision, "verified procedural history does not bind the candidate graph");
  requireApproval(latest.candidateDigest === candidate.digest, "verified procedural history does not bind the candidate graph");
  requireApproval(latest.baselineDigest === candidate.parentDigest, "verified procedural history does not bind the candidate graph");
  requireApproval(history.headEventDigest === latest.eventDigest, "verified procedural history is inconsistent");
  requireApproval(latest.activationAuthorized === false, "verified procedural history cannot carry activation authority");
  return Object.freeze({
    tenantId: candidate.tenantId,
    taskType: candidate.taskType,
    graphId: candidate.graphId,
    candidateDigest: candidate.digest,
    historyVersion: history.version,
    historyHeadEventDigest: history.headEventDigest,
    envelopeDigest: latest.envelopeDigest,
    handoffDigest: latest.handoffDigest,
    signerKeyId: latest.signerKeyId,
    expectedApprovalVersion,
  });
}

function resolveDecision(
  authority: ProceduralPolicyDecisionAuthority,
  request: ProceduralPolicyDecisionRequest,
): TrustedProceduralPolicyDecision {
  let value: TrustedProceduralPolicyDecision | null;
  try {
    value = authority.resolveProceduralPolicyDecision(request);
  } catch {
    return rejectApproval("independent procedural policy decision is required");
  }
  if (value === null) return rejectApproval("independent procedural policy decision is required");
  const decision = snapshotDecision(value);
  requireApproval(decisionMatchesRequest(decision, request), "independent procedural policy decision does not bind the exact request");
  return decision;
}

function replayMatches(
  event: ProceduralPolicyApprovalEvent,
  decision: TrustedProceduralPolicyDecision,
): boolean {
  return event.decisionId === decision.decisionId
    && event.action === decision.action
    && event.policyVersion === decision.policyVersion
    && event.candidateDigest === decision.candidateDigest
    && event.historyVersion === decision.historyVersion
    && event.historyHeadEventDigest === decision.historyHeadEventDigest
    && event.envelopeDigest === decision.envelopeDigest
    && event.handoffDigest === decision.handoffDigest
    && event.signerKeyId === decision.signerKeyId
    && event.expectedApprovalVersion === decision.expectedApprovalVersion;
}

/**
 * Durable Noema Policy / Approval repository for one procedural graph lineage. It records only Noema's
 * approval/revocation decisions and exact evidence references; State / Checkpoint remains the evaluation
 * owner, and publication/activation must perform their own fresh cross-authority checks.
 */
export class DurableProceduralPolicyApprovalRepository {
  constructor(
    private readonly storage: ApprovalStorage,
    private readonly authority: ProceduralPolicyDecisionAuthority,
  ) {}

  /**
   * Reads and verifies current Policy / Approval state for an admitted graph lineage.
   * @param candidate Locally admitted procedural graph selecting the approval stream.
   * @returns An admitted immutable snapshot, or null when no decision exists.
   */
  async read(candidate: ProceduralGraph): Promise<ProceduralPolicyApprovalSnapshot | null> {
    assertProceduralGraph(candidate);
    const retained = await this.storage.get<MutableApproval>(await storageKey(candidate));
    if (retained === undefined) return null;
    return frozenSnapshot(await verifyStoredApproval(retained, candidate));
  }

  /**
   * Resolves an independent exact policy decision and atomically appends approval or revocation under
   * monotonic CAS. The State / Checkpoint snapshot must carry fresh process-local read provenance, but
   * this transaction cannot prove that a separate State / Checkpoint object has not advanced afterward;
   * publication/activation therefore must re-read and compare the approved history identity.
   * @param candidate Locally admitted graph proposed for a pilot approval or revocation decision.
   * @param history Fresh repository-verified State / Checkpoint snapshot for the same graph lineage.
   * @param expectedApprovalVersion Exact Policy / Approval version observed before this append attempt.
   * @returns Accepted append or exact replay with a verified point-in-time approval snapshot.
   */
  async append(
    candidate: ProceduralGraph,
    history: ProceduralEvaluationHistorySnapshot,
    expectedApprovalVersion: number,
  ): Promise<ProceduralPolicyApprovalAppendResult> {
    assertProceduralGraph(candidate);
    assertProceduralEvaluationHistorySnapshot(history);
    const expectedVersion = requireVersion(expectedApprovalVersion, "expected approval version");
    const request = requestFrom(candidate, history, expectedVersion);
    const decision = resolveDecision(this.authority, request);
    if (decision.action === "approve_for_pilot") {
      const latest = history.events.at(-1);
      requireApproval(latest !== undefined, "verified procedural history is empty or inconsistent");
      requireApproval(latest.eligibleForApproval, "latest procedural evaluation is not eligible for approval");
      requireApproval(latest.decisionReason === "validation_non_regression", "latest procedural evaluation is not eligible for approval");
    }
    const key = await storageKey(candidate);

    return this.storage.transaction(async (transaction: ApprovalTransaction) => {
      const retained = await transaction.get<MutableApproval>(key);
      let approval: MutableApproval | undefined;
      if (retained !== undefined) {
        approval = await verifyStoredApproval(retained, candidate);
        const replay = approval.events.find((event) => event.decisionId === decision.decisionId);
        if (replay !== undefined) {
          requireApproval(replayMatches(replay, decision), "policy decision replay names different semantics");
          return {
            kind: "replay" as const,
            event: Object.freeze({ ...replay }),
            snapshot: frozenSnapshot(approval),
          };
        }
        requireApproval(approval.version === expectedVersion, "expected approval version lost the CAS race");
      } else {
        requireApproval(expectedVersion === 0, "expected approval version lost the CAS race");
      }

      requireApproval((approval?.events.length ?? 0) < MAX_PROCEDURAL_POLICY_APPROVAL_EVENTS, "durable procedural policy approval capacity is exhausted");
      const priorStatus = approval?.status ?? null;
      if (decision.action === "approve_for_pilot") {
        requireApproval(priorStatus !== "approved_for_pilot", "procedural graph is already approved for pilot");
      } else {
        requireApproval(priorStatus === "approved_for_pilot", "procedural graph is not approved for pilot");
      }
      const status = decision.action === "approve_for_pilot" ? "approved_for_pilot" as const : "revoked" as const;
      const withoutDigest: Omit<ProceduralPolicyApprovalEvent, "eventDigest"> = {
        schemaVersion: EVENT_SCHEMA_VERSION,
        version: expectedVersion + 1,
        decisionId: decision.decisionId,
        action: decision.action,
        policyVersion: decision.policyVersion,
        candidateDigest: decision.candidateDigest,
        historyVersion: decision.historyVersion,
        historyHeadEventDigest: decision.historyHeadEventDigest,
        envelopeDigest: decision.envelopeDigest,
        handoffDigest: decision.handoffDigest,
        signerKeyId: decision.signerKeyId,
        expectedApprovalVersion: decision.expectedApprovalVersion,
        status,
        activationAuthorized: false,
        priorEventDigest: approval?.headEventDigest ?? null,
      };
      const event = Object.freeze({
        ...withoutDigest,
        eventDigest: await sha256(eventHashMaterial(candidate, withoutDigest)),
      });
      const events = [...(approval?.events ?? []), event];
      const next: MutableApproval = {
        schemaVersion: APPROVAL_SCHEMA_VERSION,
        tenantId: candidate.tenantId,
        taskType: candidate.taskType,
        graphId: candidate.graphId,
        version: event.version,
        status,
        candidateDigest: decision.candidateDigest,
        historyVersion: decision.historyVersion,
        historyHeadEventDigest: decision.historyHeadEventDigest,
        policyVersion: decision.policyVersion,
        headEventDigest: event.eventDigest,
        activationAuthorized: false,
        events,
      };
      await transaction.put(key, next);
      return {
        kind: "accepted" as const,
        event,
        snapshot: frozenSnapshot(next),
      };
    });
  }
}

/**
 * Requires a snapshot emitted by this module after durable verification or a successful local CAS.
 * Structural clones and caller-created lookalikes never acquire Policy / Approval authority.
 * @param value Unknown candidate Policy / Approval snapshot.
 * @returns Nothing; normal return means the snapshot has current process-local repository provenance.
 */
export function assertProceduralPolicyApprovalSnapshot(
  value: unknown,
): asserts value is ProceduralPolicyApprovalSnapshot {
  if (value === null || typeof value !== "object" || !admittedApprovalSnapshots.has(value)) {
    rejectApproval("unadmitted procedural policy approval snapshot");
  }
}
