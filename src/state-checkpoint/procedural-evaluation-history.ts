import {
  assertAuthenticatedProceduralEvaluationEvidence,
  type AuthenticatedProceduralEvaluationEvidence,
} from "../agent-runtime/procedural-evaluation-handoff";
import {
  assertProceduralGraph,
  type ProceduralGraph,
} from "../agent-runtime/procedural-graph";

const HISTORY_SCHEMA_VERSION = "noema.procedural-evaluation-history/v1" as const;
const EVENT_SCHEMA_VERSION = "noema.procedural-evaluation-history-event/v1" as const;
const SHA256 = /^[0-9a-f]{64}$/u;
const DECISION_REASONS = new Set([
  "unchanged_graph",
  "previously_rejected",
  "safety_violation",
  "score_regression",
  "validation_non_regression",
]);

/**
 * Maximum complete evaluation events retained for one procedural graph lineage. The repository never
 * evicts rejection evidence silently; exhaustion fails closed until an explicit rollover design exists.
 */
export const MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS = 128;

/**
 * Stable Noema-owned partition identity for durable procedural evaluation history. It names only the
 * Agent Runtime graph scope and does not copy workflow, policy, provider, or foreign-domain truth.
 */
export interface ProceduralEvaluationHistoryStream {
  readonly tenantId: string;
  readonly taskType: string;
  readonly graphId: string;
}

/**
 * Payload-minimized immutable receipt for one authenticated procedural evaluation. Digests and opaque
 * signer identity are retained without signatures, graph text, prompts, provider credentials, or approval.
 */
export interface ProceduralEvaluationHistoryEvent {
  readonly schemaVersion: typeof EVENT_SCHEMA_VERSION;
  readonly version: number;
  readonly candidateRevision: number;
  readonly baselineDigest: string;
  readonly candidateDigest: string;
  readonly contextDigest: string;
  readonly baselineReceiptDigest: string;
  readonly candidateReceiptDigest: string;
  readonly rejectionKey: string;
  readonly decisionReason: string;
  readonly envelopeDigest: string;
  readonly signerKeyId: string;
  readonly handoffDigest: string;
  readonly issuedAtEpochSeconds: number;
  readonly expiresAtEpochSeconds: number;
  readonly eligibleForApproval: boolean;
  readonly activationAuthorized: false;
  readonly priorEventDigest: string | null;
  readonly eventDigest: string;
}

/**
 * Verified durable State / Checkpoint view for one procedural graph lineage. The complete bounded event
 * prefix and derived rejection-key projection are returned together so restart cannot invent lost history.
 */
export interface ProceduralEvaluationHistorySnapshot {
  readonly schemaVersion: typeof HISTORY_SCHEMA_VERSION;
  readonly stream: ProceduralEvaluationHistoryStream;
  readonly version: number;
  readonly headEventDigest: string;
  readonly rejectedKeys: readonly string[];
  readonly events: readonly ProceduralEvaluationHistoryEvent[];
}

/** Result of one atomic append, distinguishing a new CAS winner from an exact authenticated replay. */
export interface ProceduralEvaluationHistoryAppendResult {
  readonly kind: "accepted" | "replay";
  readonly event: ProceduralEvaluationHistoryEvent;
  readonly snapshot: ProceduralEvaluationHistorySnapshot;
}

/** Raised when durable history, graph lineage, rejection context, capacity, or CAS authority is inconsistent. */
export class ProceduralEvaluationHistoryConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProceduralEvaluationHistoryConflictError";
  }
}

type MutableHistory = {
  schemaVersion: typeof HISTORY_SCHEMA_VERSION;
  stream: ProceduralEvaluationHistoryStream;
  version: number;
  headEventDigest: string;
  rejectedKeys: string[];
  events: ProceduralEvaluationHistoryEvent[];
};

type HistoryStorage = Pick<DurableObjectStorage, "get" | "put" | "transaction">;
type HistoryTransaction = Pick<DurableObjectTransaction, "get" | "put">;

function requireHistory(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ProceduralEvaluationHistoryConflictError(message);
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function streamFromGraph(graph: ProceduralGraph): ProceduralEvaluationHistoryStream {
  return Object.freeze({ tenantId: graph.tenantId, taskType: graph.taskType, graphId: graph.graphId });
}

async function storageKey(stream: ProceduralEvaluationHistoryStream): Promise<string> {
  const digest = await sha256([HISTORY_SCHEMA_VERSION, stream.tenantId, stream.taskType, stream.graphId]);
  return `procedural-evaluation-history:v1:${digest}`;
}

function eventHashMaterial(
  stream: ProceduralEvaluationHistoryStream,
  event: Omit<ProceduralEvaluationHistoryEvent, "eventDigest">,
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

function frozenSnapshot(history: MutableHistory): ProceduralEvaluationHistorySnapshot {
  return Object.freeze({
    schemaVersion: history.schemaVersion,
    stream: Object.freeze({ ...history.stream }),
    version: history.version,
    headEventDigest: history.headEventDigest,
    rejectedKeys: Object.freeze([...history.rejectedKeys]),
    events: Object.freeze(history.events.map((event) => Object.freeze({ ...event }))),
  });
}

function assertExpectedVersion(value: number): void {
  requireHistory(Number.isSafeInteger(value), "expected history version is not canonical");
  requireHistory(value >= 0, "expected history version is not canonical");
  requireHistory(value <= MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS, "expected history version is not canonical");
}

async function verifyStoredHistory(
  value: unknown,
  expectedStream: ProceduralEvaluationHistoryStream,
): Promise<MutableHistory> {
  requireHistory(value !== null, "durable procedural history integrity check failed");
  requireHistory(typeof value === "object", "durable procedural history integrity check failed");
  requireHistory(!Array.isArray(value), "durable procedural history integrity check failed");
  const history = value as MutableHistory;
  requireHistory(history.schemaVersion === HISTORY_SCHEMA_VERSION, "durable procedural history integrity check failed");
  requireHistory(JSON.stringify(history.stream) === JSON.stringify(expectedStream), "durable procedural history integrity check failed");
  requireHistory(Number.isSafeInteger(history.version), "durable procedural history integrity check failed");
  requireHistory(history.version >= 1, "durable procedural history integrity check failed");
  requireHistory(history.version <= MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS, "durable procedural history integrity check failed");
  requireHistory(Array.isArray(history.events), "durable procedural history integrity check failed");
  requireHistory(history.events.length === history.version, "durable procedural history integrity check failed");
  requireHistory(Array.isArray(history.rejectedKeys), "durable procedural history integrity check failed");
  requireHistory(typeof history.headEventDigest === "string", "durable procedural history integrity check failed");
  requireHistory(SHA256.test(history.headEventDigest), "durable procedural history integrity check failed");

  const rejected = new Set<string>();
  const handoffDigests = new Set<string>();
  let priorEventDigest: string | null = null;
  for (let index = 0; index < history.events.length; index += 1) {
    const event = history.events[index];
    requireHistory(event !== null, "durable procedural history integrity check failed");
    requireHistory(typeof event === "object", "durable procedural history integrity check failed");
    requireHistory(event.schemaVersion === EVENT_SCHEMA_VERSION, "durable procedural history integrity check failed");
    requireHistory(event.version === index + 1, "durable procedural history integrity check failed");
    requireHistory(Number.isSafeInteger(event.candidateRevision), "durable procedural history integrity check failed");
    requireHistory(event.candidateRevision >= 2, "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.baselineDigest), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.candidateDigest), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.contextDigest), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.baselineReceiptDigest), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.candidateReceiptDigest), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.rejectionKey), "durable procedural history integrity check failed");
    requireHistory(DECISION_REASONS.has(event.decisionReason), "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.envelopeDigest), "durable procedural history integrity check failed");
    requireHistory(typeof event.signerKeyId === "string", "durable procedural history integrity check failed");
    requireHistory(event.signerKeyId.length >= 1, "durable procedural history integrity check failed");
    requireHistory(event.signerKeyId.length <= 128, "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.handoffDigest), "durable procedural history integrity check failed");
    requireHistory(!handoffDigests.has(event.handoffDigest), "durable procedural history integrity check failed");
    handoffDigests.add(event.handoffDigest);
    requireHistory(Number.isSafeInteger(event.issuedAtEpochSeconds), "durable procedural history integrity check failed");
    requireHistory(Number.isSafeInteger(event.expiresAtEpochSeconds), "durable procedural history integrity check failed");
    requireHistory(event.expiresAtEpochSeconds > event.issuedAtEpochSeconds, "durable procedural history integrity check failed");
    requireHistory(typeof event.eligibleForApproval === "boolean", "durable procedural history integrity check failed");
    requireHistory(event.activationAuthorized === false, "durable procedural history integrity check failed");
    requireHistory(event.priorEventDigest === priorEventDigest, "durable procedural history integrity check failed");
    requireHistory(SHA256.test(event.eventDigest), "durable procedural history integrity check failed");
    const observedDigest = await sha256(eventHashMaterial(expectedStream, event));
    requireHistory(event.eventDigest === observedDigest, "durable procedural history integrity check failed");
    requireHistory(event.eligibleForApproval === (event.decisionReason === "validation_non_regression"), "durable procedural history integrity check failed");
    if (event.decisionReason === "previously_rejected") {
      requireHistory(rejected.has(event.rejectionKey), "durable procedural history integrity check failed");
    } else {
      requireHistory(!rejected.has(event.rejectionKey), "durable procedural history integrity check failed");
    }
    if (!event.eligibleForApproval) rejected.add(event.rejectionKey);
    priorEventDigest = event.eventDigest;
  }

  const derivedRejectedKeys = [...rejected].sort();
  requireHistory(JSON.stringify(history.rejectedKeys) === JSON.stringify(derivedRejectedKeys), "durable procedural history integrity check failed");
  requireHistory(history.headEventDigest === priorEventDigest, "durable procedural history integrity check failed");
  return history;
}

function replayMatches(
  event: ProceduralEvaluationHistoryEvent,
  candidate: ProceduralGraph,
  authenticated: AuthenticatedProceduralEvaluationEvidence,
): boolean {
  const evidence = authenticated.evidence;
  return JSON.stringify([
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
  ]) === JSON.stringify([
    candidate.revision,
    evidence.baselineDigest,
    evidence.candidateDigest,
    evidence.contextDigest,
    evidence.baselineReceiptDigest,
    evidence.candidateReceiptDigest,
    evidence.rejectionKey,
    evidence.decisionReason,
    evidence.envelopeDigest,
    authenticated.signerKeyId,
    authenticated.handoffDigest,
    authenticated.issuedAtEpochSeconds,
    authenticated.expiresAtEpochSeconds,
    evidence.eligibleForApproval,
  ]);
}

/**
 * State / Checkpoint repository for authenticated procedural evaluation and rejection evidence. It
 * persists a bounded complete lineage under atomic CAS without creating workflow, policy, or activation truth.
 */
export class DurableProceduralEvaluationHistoryRepository {
  constructor(private readonly storage: HistoryStorage) {}

  /**
   * Reads and verifies the complete bounded history for one locally admitted procedural graph lineage.
   * Missing state returns null; retained corruption, truncation, or projection drift fails closed.
   * @param candidate Locally admitted graph whose tenant/task/graph identity selects the durable lineage.
   * @returns Verified immutable history snapshot, or null when no evaluation has been retained yet.
   */
  async read(candidate: ProceduralGraph): Promise<ProceduralEvaluationHistorySnapshot | null> {
    assertProceduralGraph(candidate);
    const stream = streamFromGraph(candidate);
    const value = await this.storage.get<MutableHistory>(await storageKey(stream));
    if (value === undefined) return null;
    return frozenSnapshot(await verifyStoredHistory(value, stream));
  }

  /**
   * Atomically retains one still-current authenticated evaluator handoff for the exact candidate graph.
   * Exact replay is idempotent; stale CAS, stale rejection context, full history, or lineage drift fails closed.
   * @param candidate Locally admitted direct-child graph bound by the authenticated evaluation evidence.
   * @param authenticated Still-current process-local signed evaluator authority produced by Agent Runtime.
   * @param expectedVersion Exact durable history version observed by the caller before this append attempt.
   * @returns Accepted append or exact replay together with a verified immutable State / Checkpoint snapshot.
   */
  async append(
    candidate: ProceduralGraph,
    authenticated: AuthenticatedProceduralEvaluationEvidence,
    expectedVersion: number,
  ): Promise<ProceduralEvaluationHistoryAppendResult> {
    assertProceduralGraph(candidate);
    assertAuthenticatedProceduralEvaluationEvidence(authenticated);
    assertExpectedVersion(expectedVersion);
    const evidence = authenticated.evidence;
    requireHistory(candidate.parentDigest !== null, "authenticated evaluation does not bind the admitted candidate graph");
    requireHistory(evidence.candidateDigest === candidate.digest, "authenticated evaluation does not bind the admitted candidate graph");
    requireHistory(evidence.baselineDigest === candidate.parentDigest, "authenticated evaluation does not bind the admitted candidate graph");
    const stream = streamFromGraph(candidate);
    const key = await storageKey(stream);

    return this.storage.transaction(async (transaction: HistoryTransaction) => {
      const retained = await transaction.get<MutableHistory>(key);
      let history: MutableHistory;
      if (retained === undefined) {
        requireHistory(expectedVersion === 0, "expected history version lost the CAS race");
        history = {
          schemaVersion: HISTORY_SCHEMA_VERSION,
          stream,
          version: 0,
          headEventDigest: "",
          rejectedKeys: [],
          events: [],
        };
      } else {
        history = await verifyStoredHistory(retained, stream);
        const replay = history.events.find((event) => event.handoffDigest === authenticated.handoffDigest);
        if (replay !== undefined) {
          requireHistory(replayMatches(replay, candidate, authenticated), "authenticated replay names different durable semantics");
          return { kind: "replay" as const, event: Object.freeze({ ...replay }), snapshot: frozenSnapshot(history) };
        }
        requireHistory(history.version === expectedVersion, "expected history version lost the CAS race");
      }

      requireHistory(history.events.length < MAX_PROCEDURAL_EVALUATION_HISTORY_EVENTS, "durable procedural history capacity is exhausted");
      const rejectionKeys = new Set(history.rejectedKeys);
      if (evidence.decisionReason === "previously_rejected") {
        requireHistory(rejectionKeys.has(evidence.rejectionKey), "decision does not reflect durable rejection history");
      } else {
        requireHistory(!rejectionKeys.has(evidence.rejectionKey), "decision does not reflect durable rejection history");
      }
      if (!evidence.eligibleForApproval) rejectionKeys.add(evidence.rejectionKey);

      const withoutDigest: Omit<ProceduralEvaluationHistoryEvent, "eventDigest"> = {
        schemaVersion: EVENT_SCHEMA_VERSION,
        version: history.version + 1,
        candidateRevision: candidate.revision,
        baselineDigest: evidence.baselineDigest,
        candidateDigest: evidence.candidateDigest,
        contextDigest: evidence.contextDigest,
        baselineReceiptDigest: evidence.baselineReceiptDigest,
        candidateReceiptDigest: evidence.candidateReceiptDigest,
        rejectionKey: evidence.rejectionKey,
        decisionReason: evidence.decisionReason,
        envelopeDigest: evidence.envelopeDigest,
        signerKeyId: authenticated.signerKeyId,
        handoffDigest: authenticated.handoffDigest,
        issuedAtEpochSeconds: authenticated.issuedAtEpochSeconds,
        expiresAtEpochSeconds: authenticated.expiresAtEpochSeconds,
        eligibleForApproval: evidence.eligibleForApproval,
        activationAuthorized: false,
        priorEventDigest: history.version === 0 ? null : history.headEventDigest,
      };
      const event: ProceduralEvaluationHistoryEvent = Object.freeze({
        ...withoutDigest,
        eventDigest: await sha256(eventHashMaterial(stream, withoutDigest)),
      });
      const next: MutableHistory = {
        schemaVersion: HISTORY_SCHEMA_VERSION,
        stream,
        version: event.version,
        headEventDigest: event.eventDigest,
        rejectedKeys: [...rejectionKeys].sort(),
        events: [...history.events, event],
      };
      await transaction.put(key, next);
      return { kind: "accepted" as const, event, snapshot: frozenSnapshot(next) };
    });
  }
}
