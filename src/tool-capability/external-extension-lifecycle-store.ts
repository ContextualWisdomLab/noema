import {
  EXTERNAL_EXTENSION_ADMISSION_STATES,
  type ExternalExtensionAdmissionState,
} from "./internal/external-extension-admission-core";

const SCHEMA_VERSION = 1 as const;
const HEX40_OR_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const IDENTIFIER = /^[a-z][a-z0-9_]{2,127}$/u;
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/u;
const RELATIVE_PATH = /^(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const REFERENCE = /^urn:cwl:[a-z0-9][a-z0-9._:-]{3,253}$/u;
const OPAQUE_ID = /^[\x21-\x7e]{1,160}$/u;
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const STATES = new Set<ExternalExtensionAdmissionState>(EXTERNAL_EXTENSION_ADMISSION_STATES);

const ALLOWED_TRANSITIONS: Readonly<Record<ExternalExtensionAdmissionState, ReadonlySet<ExternalExtensionAdmissionState>>> = {
  discovered: new Set(["source_pinned", "rejected"]),
  source_pinned: new Set(["statically_scanned", "rejected"]),
  statically_scanned: new Set(["quarantined", "rejected"]),
  quarantined: new Set(["capability_reviewed", "rejected"]),
  capability_reviewed: new Set(["approved_for_pilot", "rejected"]),
  approved_for_pilot: new Set(["active", "rejected", "expired"]),
  active: new Set(["suspended", "superseded", "expired"]),
  suspended: new Set(["active", "superseded", "rejected", "expired"]),
  superseded: new Set(),
  rejected: new Set(),
  expired: new Set(),
};

/** Immutable identity that partitions one lifecycle stream by exact reviewed source and artifact bytes. */
export interface ExternalExtensionLifecycleStreamIdentity {
  readonly external_extension_id: string;
  readonly upstream_repository: string;
  readonly upstream_commit_sha: string;
  readonly upstream_path: string;
  readonly artifact_sha256: string;
  readonly marketplace_entry_sha256: string;
}

/** Payload-minimized transition request accepted by the Noema Tool Capability lifecycle boundary. */
export interface ExternalExtensionLifecycleAppend {
  readonly transition_id: string;
  readonly stream: ExternalExtensionLifecycleStreamIdentity;
  readonly expected_version: number;
  readonly prior_state: ExternalExtensionAdmissionState | null;
  readonly next_state: ExternalExtensionAdmissionState;
  readonly policy_approval_reference: string;
  readonly activation_policy_version: string;
  readonly effective_scope_reference: string;
  readonly appguardrail_evidence_reference: string;
  readonly appguardrail_profile_identity: string;
  readonly appguardrail_profile_sha256: string;
  readonly quarantine_evidence_reference: string;
  readonly quarantine_profile_identity: string;
  readonly quarantine_profile_sha256: string;
  readonly isolation_profile_reference: string;
  readonly egress_policy_reference: string;
  readonly occurred_at: string;
  readonly causation_id: string;
  readonly correlation_id: string;
  readonly actor_identity_handle: string;
}

/** Port that re-reads Noema Policy/Approval and foreign-owner evidence immediately before activation append. */
export interface ExternalExtensionLifecycleEvidenceVerifier {
  assertCurrentActivationEvidence(request: Readonly<ExternalExtensionLifecycleAppend>): Promise<void>;
}

/** Append-only lifecycle event retaining only Noema authority and immutable foreign-owner evidence references. */
export interface ExternalExtensionLifecycleEvent extends ExternalExtensionLifecycleAppend {
  readonly schema_version: 1;
  readonly version: number;
  readonly prior_event_sha256: string | null;
  readonly request_sha256: string;
  readonly event_sha256: string;
}

/** Compact current projection reconstructed from and cryptographically bound to the append-only event stream. */
export interface ExternalExtensionLifecycleSnapshot {
  readonly schema_version: 1;
  readonly stream: ExternalExtensionLifecycleStreamIdentity;
  readonly version: number;
  readonly state: ExternalExtensionAdmissionState;
  readonly head_event_sha256: string;
}

/** Result of an append, distinguishing a new CAS winner from an exact idempotent replay. */
export interface ExternalExtensionLifecycleAppendResult {
  readonly kind: "accepted" | "replay";
  readonly event: ExternalExtensionLifecycleEvent;
  readonly snapshot: ExternalExtensionLifecycleSnapshot;
}

/** Raised when untrusted lifecycle input is malformed or requests an illegal state transition. */
export class ExternalExtensionLifecycleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalExtensionLifecycleValidationError";
  }
}

/** Raised when fresh activation authority cannot be established without copying owner truth into Noema. */
export class ExternalExtensionLifecycleEvidenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalExtensionLifecycleEvidenceError";
  }
}

/** Raised when a stale writer, conflicting replay, or corrupted durable ledger cannot be trusted. */
export class ExternalExtensionLifecycleConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExternalExtensionLifecycleConflictError";
  }
}

type LifecycleStorage = Pick<DurableObjectStorage, "get" | "put" | "list" | "transaction">;
type TransitionIndex = Readonly<{ request_sha256: string; version: number }>;

type TransactionAppendResult =
  | Readonly<{
      kind: "accepted";
      event: ExternalExtensionLifecycleEvent;
      snapshot: ExternalExtensionLifecycleSnapshot;
    }>
  | Readonly<{ kind: "replay_candidate" }>;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new ExternalExtensionLifecycleValidationError(message);
}

function canonicalStream(stream: ExternalExtensionLifecycleStreamIdentity): ExternalExtensionLifecycleStreamIdentity {
  assert(IDENTIFIER.test(stream.external_extension_id), "invalid external_extension_id");
  assert(REPOSITORY.test(stream.upstream_repository), "invalid upstream_repository");
  assert(HEX40_OR_64.test(stream.upstream_commit_sha), "invalid upstream_commit_sha");
  assert(RELATIVE_PATH.test(stream.upstream_path), "invalid upstream_path");
  assert(SHA256.test(stream.artifact_sha256), "invalid artifact_sha256");
  assert(SHA256.test(stream.marketplace_entry_sha256), "invalid marketplace_entry_sha256");
  return {
    external_extension_id: stream.external_extension_id,
    upstream_repository: stream.upstream_repository,
    upstream_commit_sha: stream.upstream_commit_sha,
    upstream_path: stream.upstream_path,
    artifact_sha256: stream.artifact_sha256,
    marketplace_entry_sha256: stream.marketplace_entry_sha256,
  };
}

function canonicalRequest(input: ExternalExtensionLifecycleAppend): ExternalExtensionLifecycleAppend {
  const stream = canonicalStream(input.stream);
  assert(OPAQUE_ID.test(input.transition_id), "invalid transition_id");
  assert(Number.isSafeInteger(input.expected_version) && input.expected_version >= 0, "invalid expected_version");
  assert(input.prior_state === null || STATES.has(input.prior_state), "invalid prior_state");
  assert(STATES.has(input.next_state), "invalid next_state");
  for (const [field, value] of Object.entries({
    policy_approval_reference: input.policy_approval_reference,
    activation_policy_version: input.activation_policy_version,
    effective_scope_reference: input.effective_scope_reference,
    appguardrail_evidence_reference: input.appguardrail_evidence_reference,
    appguardrail_profile_identity: input.appguardrail_profile_identity,
    quarantine_evidence_reference: input.quarantine_evidence_reference,
    quarantine_profile_identity: input.quarantine_profile_identity,
    isolation_profile_reference: input.isolation_profile_reference,
    egress_policy_reference: input.egress_policy_reference,
  })) {
    assert(REFERENCE.test(value), `invalid ${field}`);
  }
  assert(SHA256.test(input.appguardrail_profile_sha256), "invalid appguardrail_profile_sha256");
  assert(SHA256.test(input.quarantine_profile_sha256), "invalid quarantine_profile_sha256");
  assert(TIMESTAMP.test(input.occurred_at) && !Number.isNaN(Date.parse(input.occurred_at)), "invalid occurred_at");
  assert(OPAQUE_ID.test(input.causation_id), "invalid causation_id");
  assert(OPAQUE_ID.test(input.correlation_id), "invalid correlation_id");
  assert(OPAQUE_ID.test(input.actor_identity_handle), "invalid actor_identity_handle");
  return {
    transition_id: input.transition_id,
    stream,
    expected_version: input.expected_version,
    prior_state: input.prior_state,
    next_state: input.next_state,
    policy_approval_reference: input.policy_approval_reference,
    activation_policy_version: input.activation_policy_version,
    effective_scope_reference: input.effective_scope_reference,
    appguardrail_evidence_reference: input.appguardrail_evidence_reference,
    appguardrail_profile_identity: input.appguardrail_profile_identity,
    appguardrail_profile_sha256: input.appguardrail_profile_sha256,
    quarantine_evidence_reference: input.quarantine_evidence_reference,
    quarantine_profile_identity: input.quarantine_profile_identity,
    quarantine_profile_sha256: input.quarantine_profile_sha256,
    isolation_profile_reference: input.isolation_profile_reference,
    egress_policy_reference: input.egress_policy_reference,
    occurred_at: input.occurred_at,
    causation_id: input.causation_id,
    correlation_id: input.correlation_id,
    actor_identity_handle: input.actor_identity_handle,
  };
}

function requestHashMaterial(event: ExternalExtensionLifecycleEvent): ExternalExtensionLifecycleAppend {
  return {
    transition_id: event.transition_id,
    stream: event.stream,
    expected_version: event.expected_version,
    prior_state: event.prior_state,
    next_state: event.next_state,
    policy_approval_reference: event.policy_approval_reference,
    activation_policy_version: event.activation_policy_version,
    effective_scope_reference: event.effective_scope_reference,
    appguardrail_evidence_reference: event.appguardrail_evidence_reference,
    appguardrail_profile_identity: event.appguardrail_profile_identity,
    appguardrail_profile_sha256: event.appguardrail_profile_sha256,
    quarantine_evidence_reference: event.quarantine_evidence_reference,
    quarantine_profile_identity: event.quarantine_profile_identity,
    quarantine_profile_sha256: event.quarantine_profile_sha256,
    isolation_profile_reference: event.isolation_profile_reference,
    egress_policy_reference: event.egress_policy_reference,
    occurred_at: event.occurred_at,
    causation_id: event.causation_id,
    correlation_id: event.correlation_id,
    actor_identity_handle: event.actor_identity_handle,
  };
}

async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function validateEdge(prior: ExternalExtensionAdmissionState | null, next: ExternalExtensionAdmissionState): void {
  if (prior === null) {
    assert(next === "discovered", "the first lifecycle state must be discovered");
    return;
  }
  assert(ALLOWED_TRANSITIONS[prior].has(next), `illegal lifecycle transition ${prior} -> ${next}`);
}

function eventHashMaterial(event: Omit<ExternalExtensionLifecycleEvent, "event_sha256">): unknown {
  return {
    schema_version: event.schema_version,
    version: event.version,
    transition_id: event.transition_id,
    stream: event.stream,
    expected_version: event.expected_version,
    prior_state: event.prior_state,
    next_state: event.next_state,
    policy_approval_reference: event.policy_approval_reference,
    activation_policy_version: event.activation_policy_version,
    effective_scope_reference: event.effective_scope_reference,
    appguardrail_evidence_reference: event.appguardrail_evidence_reference,
    appguardrail_profile_identity: event.appguardrail_profile_identity,
    appguardrail_profile_sha256: event.appguardrail_profile_sha256,
    quarantine_evidence_reference: event.quarantine_evidence_reference,
    quarantine_profile_identity: event.quarantine_profile_identity,
    quarantine_profile_sha256: event.quarantine_profile_sha256,
    isolation_profile_reference: event.isolation_profile_reference,
    egress_policy_reference: event.egress_policy_reference,
    occurred_at: event.occurred_at,
    causation_id: event.causation_id,
    correlation_id: event.correlation_id,
    actor_identity_handle: event.actor_identity_handle,
    prior_event_sha256: event.prior_event_sha256,
    request_sha256: event.request_sha256,
  };
}

function snapshotFromEvent(event: ExternalExtensionLifecycleEvent): ExternalExtensionLifecycleSnapshot {
  return {
    schema_version: SCHEMA_VERSION,
    stream: event.stream,
    version: event.version,
    state: event.next_state,
    head_event_sha256: event.event_sha256,
  };
}

async function streamPrefix(stream: ExternalExtensionLifecycleStreamIdentity): Promise<string> {
  return `external_extension_lifecycle:${await sha256(stream)}:`;
}

function eventKey(prefix: string, version: number): string {
  return `${prefix}event:${version.toString().padStart(12, "0")}`;
}

async function transitionKey(prefix: string, transitionId: string): Promise<string> {
  return `${prefix}transition:${await sha256(transitionId)}`;
}

/** Durable append-only repository for one extension/artifact lifecycle stream. */
export class DurableExternalExtensionLifecycleRepository {
  constructor(
    private readonly storage: LifecycleStorage,
    private readonly evidenceVerifier?: ExternalExtensionLifecycleEvidenceVerifier,
  ) {}

  private async readExistingReplay(
    prefix: string,
    indexKey: string,
    requestSha256: string,
  ): Promise<ExternalExtensionLifecycleAppendResult | null> {
    const existingIndex = await this.storage.get<TransitionIndex>(indexKey);
    if (existingIndex === undefined) return null;
    if (existingIndex.request_sha256 !== requestSha256) {
      throw new ExternalExtensionLifecycleConflictError("transition_id already names different semantics");
    }
    const existingEvent = await this.storage.get<ExternalExtensionLifecycleEvent>(eventKey(prefix, existingIndex.version));
    const head = await this.storage.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
    if (existingEvent === undefined || head === undefined) {
      throw new ExternalExtensionLifecycleConflictError("idempotency index points to missing durable evidence");
    }
    const embeddedRequestSha256 = await sha256(requestHashMaterial(existingEvent));
    const embeddedEventSha256 = await sha256(eventHashMaterial(existingEvent));
    if (
      existingEvent.schema_version !== SCHEMA_VERSION
      || existingEvent.version !== existingIndex.version
      || existingEvent.request_sha256 !== requestSha256
      || embeddedRequestSha256 !== requestSha256
      || existingEvent.event_sha256 !== embeddedEventSha256
      || head.schema_version !== SCHEMA_VERSION
      || head.version < existingEvent.version
      || JSON.stringify(head.stream) !== JSON.stringify(existingEvent.stream)
    ) {
      throw new ExternalExtensionLifecycleConflictError("idempotent replay evidence failed integrity verification");
    }
    const tail = await this.storage.get<ExternalExtensionLifecycleEvent>(eventKey(prefix, head.version));
    if (tail === undefined) {
      throw new ExternalExtensionLifecycleConflictError("lifecycle head points to missing audit tail");
    }
    const tailDigest = await sha256(eventHashMaterial(tail));
    if (
      tail.schema_version !== SCHEMA_VERSION
      || tail.version !== head.version
      || tail.event_sha256 !== tailDigest
      || head.state !== tail.next_state
      || head.head_event_sha256 !== tail.event_sha256
      || JSON.stringify(tail.stream) !== JSON.stringify(head.stream)
    ) {
      throw new ExternalExtensionLifecycleConflictError("lifecycle head does not match durable audit tail");
    }
    return {
      kind: "replay",
      event: structuredClone(existingEvent),
      snapshot: snapshotFromEvent(existingEvent),
    };
  }

  /** Returns the compact current projection with O(1) tail verification; full prefix verification stays on readAudit/recovery paths. */
  async readCurrent(streamInput: ExternalExtensionLifecycleStreamIdentity): Promise<ExternalExtensionLifecycleSnapshot | null> {
    const stream = canonicalStream(streamInput);
    const prefix = await streamPrefix(stream);
    const snapshot = await this.storage.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
    if (snapshot === undefined) return null;
    const tail = await this.storage.get<ExternalExtensionLifecycleEvent>(eventKey(prefix, snapshot.version));
    if (tail === undefined) {
      throw new ExternalExtensionLifecycleConflictError("lifecycle head points to missing audit tail");
    }
    const tailRequestDigest = await sha256(requestHashMaterial(tail));
    const tailDigest = await sha256(eventHashMaterial(tail));
    if (
      snapshot.schema_version !== SCHEMA_VERSION
      || tail.schema_version !== SCHEMA_VERSION
      || snapshot.version !== tail.version
      || snapshot.state !== tail.next_state
      || snapshot.head_event_sha256 !== tail.event_sha256
      || tail.request_sha256 !== tailRequestDigest
      || tail.event_sha256 !== tailDigest
      || JSON.stringify(snapshot.stream) !== JSON.stringify(stream)
      || JSON.stringify(tail.stream) !== JSON.stringify(stream)
    ) {
      throw new ExternalExtensionLifecycleConflictError("lifecycle head does not match verified audit tail");
    }
    return structuredClone(snapshot);
  }

  /** Reads and verifies the complete retained digest chain; lifecycle audit evidence is never ring-buffer truncated. */
  async readAudit(streamInput: ExternalExtensionLifecycleStreamIdentity): Promise<readonly ExternalExtensionLifecycleEvent[]> {
    const stream = canonicalStream(streamInput);
    const prefix = await streamPrefix(stream);
    const records = await this.storage.list<ExternalExtensionLifecycleEvent>({ prefix: `${prefix}event:` });
    const events = [...records.values()];
    let previous: string | null = null;
    for (const [index, event] of events.entries()) {
      const expectedVersion = index + 1;
      if (event.schema_version !== SCHEMA_VERSION || event.version !== expectedVersion || event.prior_event_sha256 !== previous || JSON.stringify(event.stream) !== JSON.stringify(stream)) {
        throw new ExternalExtensionLifecycleConflictError("lifecycle audit sequence is malformed or truncated");
      }
      const material = eventHashMaterial(event);
      const digest = await sha256(material);
      const requestDigest = await sha256(requestHashMaterial(event));
      if (event.event_sha256 !== digest || event.request_sha256 !== requestDigest || !SHA256.test(event.request_sha256)) {
        throw new ExternalExtensionLifecycleConflictError("lifecycle audit digest verification failed");
      }
      previous = event.event_sha256;
    }
    const head = await this.storage.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
    if ((head === undefined) !== (events.length === 0)) {
      throw new ExternalExtensionLifecycleConflictError("lifecycle head/audit presence mismatch");
    }
    if (head !== undefined) {
      const last = events.at(-1)!;
      if (head.version !== last.version || head.state !== last.next_state || head.head_event_sha256 !== last.event_sha256) {
        throw new ExternalExtensionLifecycleConflictError("lifecycle head does not match audit tail");
      }
    }
    return structuredClone(events);
  }

  /** Atomically appends one legal transition or returns the immutable result of an exact duplicate replay. */
  async append(input: ExternalExtensionLifecycleAppend): Promise<ExternalExtensionLifecycleAppendResult> {
    const request = canonicalRequest(input);
    validateEdge(request.prior_state, request.next_state);
    const prefix = await streamPrefix(request.stream);
    const requestSha256 = await sha256(request);
    const indexKey = await transitionKey(prefix, request.transition_id);
    const replay = await this.readExistingReplay(prefix, indexKey, requestSha256);
    if (replay !== null) return replay;

    const observedHead = await this.storage.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
    const priorEventSha256 = observedHead?.head_event_sha256 ?? null;
    const version = request.expected_version + 1;
    const withoutDigest: Omit<ExternalExtensionLifecycleEvent, "event_sha256"> = {
      schema_version: SCHEMA_VERSION,
      version,
      ...request,
      prior_event_sha256: priorEventSha256,
      request_sha256: requestSha256,
    };
    const event: ExternalExtensionLifecycleEvent = {
      ...withoutDigest,
      event_sha256: await sha256(eventHashMaterial(withoutDigest)),
    };

    if (request.next_state === "active") {
      try {
        if (this.evidenceVerifier === undefined) {
          throw new ExternalExtensionLifecycleEvidenceError(
            "fresh Policy/Approval and owner evidence verification is required before activation",
          );
        }
        await this.evidenceVerifier.assertCurrentActivationEvidence(request);
      } catch (error) {
        const committedReplay = await this.readExistingReplay(prefix, indexKey, requestSha256);
        if (committedReplay !== null) return committedReplay;
        throw error;
      }
    }

    const transactionResult: TransactionAppendResult = await this.storage.transaction(async (txn) => {
      const existingIndex = await txn.get<TransitionIndex>(indexKey);
      if (existingIndex !== undefined) {
        if (existingIndex.request_sha256 !== requestSha256) {
          throw new ExternalExtensionLifecycleConflictError("transition_id already names different semantics");
        }
        const existingEvent = await txn.get<ExternalExtensionLifecycleEvent>(eventKey(prefix, existingIndex.version));
        const head = await txn.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
        if (existingEvent === undefined || head === undefined) {
          throw new ExternalExtensionLifecycleConflictError("idempotency index points to missing durable evidence");
        }
        if (
          existingEvent.schema_version !== SCHEMA_VERSION
          || existingEvent.version !== existingIndex.version
          || existingEvent.request_sha256 !== requestSha256
          || existingEvent.transition_id !== request.transition_id
          || head.schema_version !== SCHEMA_VERSION
          || head.version < existingEvent.version
          || JSON.stringify(head.stream) !== JSON.stringify(request.stream)
          || (head.version === existingEvent.version
            && (head.state !== existingEvent.next_state || head.head_event_sha256 !== existingEvent.event_sha256))
        ) {
          throw new ExternalExtensionLifecycleConflictError("transactional replay evidence failed integrity verification");
        }
        return { kind: "replay_candidate" as const };
      }

      const current = await txn.get<ExternalExtensionLifecycleSnapshot>(`${prefix}head`);
      const currentVersion = current?.version ?? 0;
      const currentState = current?.state ?? null;
      const currentDigest = current?.head_event_sha256 ?? null;
      if (currentVersion !== request.expected_version || currentState !== request.prior_state || currentDigest !== priorEventSha256) {
        throw new ExternalExtensionLifecycleConflictError("expected lifecycle version/head lost the CAS race");
      }
      validateEdge(currentState, request.next_state);

      const snapshot: ExternalExtensionLifecycleSnapshot = {
        schema_version: SCHEMA_VERSION,
        stream: request.stream,
        version,
        state: request.next_state,
        head_event_sha256: event.event_sha256,
      };
      await txn.put(eventKey(prefix, version), event);
      await txn.put(indexKey, { request_sha256: requestSha256, version } satisfies TransitionIndex);
      await txn.put(`${prefix}head`, snapshot);
      return { kind: "accepted" as const, event: structuredClone(event), snapshot: structuredClone(snapshot) };
    });

    if (transactionResult.kind === "accepted") {
      return transactionResult;
    }
    const verifiedReplay = await this.readExistingReplay(prefix, indexKey, requestSha256);
    if (verifiedReplay === null) {
      throw new ExternalExtensionLifecycleConflictError("transactional replay evidence disappeared before verification");
    }
    return verifiedReplay;
  }
}
