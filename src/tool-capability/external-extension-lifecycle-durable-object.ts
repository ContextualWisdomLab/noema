import {
  DurableExternalExtensionLifecycleRepository,
  ExternalExtensionLifecycleConflictError,
  ExternalExtensionLifecycleEvidenceError,
  ExternalExtensionLifecycleValidationError,
  type ExternalExtensionLifecycleAppend,
  type ExternalExtensionLifecycleAppendResult,
  type ExternalExtensionLifecycleEvent,
  type ExternalExtensionLifecycleSnapshot,
  type ExternalExtensionLifecycleStreamIdentity,
} from "./external-extension-lifecycle-store";

const LIFECYCLE_INTERNAL_ENDPOINT = "https://noema-external-extension-lifecycle.internal/command";
const IDENTIFIER = /^[a-z][a-z0-9_]{2,127}$/u;
const REPOSITORY = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/u;
const HEX40_OR_64 = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const RELATIVE_PATH = /^(?!\/)[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;

/** Cloudflare binding that routes each exact extension/artifact stream to one lifecycle authority. */
export interface ExternalExtensionLifecycleDurableObjectEnv {
  NOEMA_EXTERNAL_EXTENSION_LIFECYCLE: DurableObjectNamespace;
}

/** Bounded operational observation for one exact lifecycle Durable Object. */
export interface ExternalExtensionLifecycleOperabilitySnapshot {
  readonly database_size_bytes: number;
}

/** Private command surface between Noema runtime adapters and the lifecycle Durable Object. */
export type ExternalExtensionLifecycleCommand =
  | { readonly operation: "append"; readonly request: ExternalExtensionLifecycleAppend }
  | { readonly operation: "read_current"; readonly stream: ExternalExtensionLifecycleStreamIdentity }
  | { readonly operation: "read_audit"; readonly stream: ExternalExtensionLifecycleStreamIdentity }
  | { readonly operation: "read_operability"; readonly stream: ExternalExtensionLifecycleStreamIdentity };

type ExternalExtensionLifecycleCommandData =
  | ExternalExtensionLifecycleAppendResult
  | ExternalExtensionLifecycleSnapshot
  | ExternalExtensionLifecycleOperabilitySnapshot
  | readonly ExternalExtensionLifecycleEvent[]
  | null;

type ExternalExtensionLifecycleCommandResponse =
  | { readonly ok: true; readonly data: ExternalExtensionLifecycleCommandData }
  | {
      readonly ok: false;
      readonly error: "invalid_request" | "conflict" | "evidence_unavailable" | "internal_error";
    };

/** Reject null and array-shaped JSON before any untrusted property projection occurs. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Accept only the bounded JSON media type used by the private command protocol. */
function isJsonMediaType(value: string | null): boolean {
  return /^[ \t]*application\/json[ \t]*(?:;[ \t]*charset[ \t]*=[ \t]*utf-8[ \t]*)?$/iu.test(value ?? "");
}

/** Emit normalized non-cacheable responses without leaking repository or storage exception detail. */
function jsonResponse(body: ExternalExtensionLifecycleCommandResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

/** Preserve string type authority at the JSON boundary instead of relying on RegExp coercion downstream. */
function stringField(value: Record<string, unknown>, field: string): string {
  const candidate = value[field];
  if (typeof candidate !== "string") {
    throw new ExternalExtensionLifecycleValidationError(`lifecycle append ${field} must be a string`);
  }
  return candidate;
}

/** Preserve numeric CAS-version type authority before repository safe-integer validation. */
function numberField(value: Record<string, unknown>, field: string): number {
  const candidate = value[field];
  if (typeof candidate !== "number") {
    throw new ExternalExtensionLifecycleValidationError(`lifecycle append ${field} must be a number`);
  }
  return candidate;
}

/** Preserve the explicit null-or-state-string shape used for the first lifecycle transition. */
function nullableStringField(value: Record<string, unknown>, field: string): string | null {
  const candidate = value[field];
  if (candidate !== null && typeof candidate !== "string") {
    throw new ExternalExtensionLifecycleValidationError(
      `lifecycle append ${field} must be a string or null`,
    );
  }
  return candidate;
}

/**
 * Project only stream coordinates needed for lifecycle routing.
 * This is a transport ACL, not a second lifecycle domain model: transition legality and durable
 * evidence invariants remain owned by DurableExternalExtensionLifecycleRepository.
 */
function projectStream(value: unknown): ExternalExtensionLifecycleStreamIdentity {
  if (!isRecord(value)) {
    throw new ExternalExtensionLifecycleValidationError("lifecycle stream must be an object");
  }
  const stream = {
    external_extension_id: value.external_extension_id,
    upstream_repository: value.upstream_repository,
    upstream_commit_sha: value.upstream_commit_sha,
    upstream_path: value.upstream_path,
    artifact_sha256: value.artifact_sha256,
    marketplace_entry_sha256: value.marketplace_entry_sha256,
  };
  if (
    typeof stream.external_extension_id !== "string"
    || !IDENTIFIER.test(stream.external_extension_id)
    || typeof stream.upstream_repository !== "string"
    || !REPOSITORY.test(stream.upstream_repository)
    || typeof stream.upstream_commit_sha !== "string"
    || !HEX40_OR_64.test(stream.upstream_commit_sha)
    || typeof stream.upstream_path !== "string"
    || !RELATIVE_PATH.test(stream.upstream_path)
    || typeof stream.artifact_sha256 !== "string"
    || !SHA256.test(stream.artifact_sha256)
    || typeof stream.marketplace_entry_sha256 !== "string"
    || !SHA256.test(stream.marketplace_entry_sha256)
  ) {
    throw new ExternalExtensionLifecycleValidationError("lifecycle stream identity is not canonical");
  }
  return stream as ExternalExtensionLifecycleStreamIdentity;
}

/** Project the complete append contract while rejecting scalar type confusion before repository validation. */
function projectAppend(value: unknown): ExternalExtensionLifecycleAppend {
  if (!isRecord(value)) {
    throw new ExternalExtensionLifecycleValidationError("lifecycle append must be an object");
  }
  return {
    transition_id: stringField(value, "transition_id"),
    stream: projectStream(value.stream),
    expected_version: numberField(value, "expected_version"),
    prior_state: nullableStringField(value, "prior_state") as ExternalExtensionLifecycleAppend["prior_state"],
    next_state: stringField(value, "next_state") as ExternalExtensionLifecycleAppend["next_state"],
    policy_approval_reference: stringField(value, "policy_approval_reference"),
    activation_policy_version: stringField(value, "activation_policy_version"),
    effective_scope_reference: stringField(value, "effective_scope_reference"),
    appguardrail_evidence_reference: stringField(value, "appguardrail_evidence_reference"),
    appguardrail_profile_identity: stringField(value, "appguardrail_profile_identity"),
    appguardrail_profile_sha256: stringField(value, "appguardrail_profile_sha256"),
    quarantine_evidence_reference: stringField(value, "quarantine_evidence_reference"),
    quarantine_profile_identity: stringField(value, "quarantine_profile_identity"),
    quarantine_profile_sha256: stringField(value, "quarantine_profile_sha256"),
    isolation_profile_reference: stringField(value, "isolation_profile_reference"),
    egress_policy_reference: stringField(value, "egress_policy_reference"),
    occurred_at: stringField(value, "occurred_at"),
    causation_id: stringField(value, "causation_id"),
    correlation_id: stringField(value, "correlation_id"),
    actor_identity_handle: stringField(value, "actor_identity_handle"),
  };
}

/** Hash canonical JSON material for privacy-preserving stream-scoped object names. */
async function sha256Hex(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Derive the privacy-preserving Durable Object name for one canonical exact lifecycle stream.
 * Exact source/artifact coordinates participate in the name so unrelated artifacts cannot share
 * an object simply because their marketplace extension identifier is the same.
 * @param streamInput Untrusted candidate coordinates projected into the canonical lifecycle stream identity.
 * @returns A deterministic object name derived only from the canonical stream coordinates.
 */
export async function externalExtensionLifecycleObjectName(
  streamInput: unknown,
): Promise<string> {
  const stream = projectStream(streamInput);
  return `external-extension-lifecycle:${await sha256Hex(stream)}`;
}

/** Project commands before serialization so caller-only properties never cross the persistence boundary. */
function projectedTransportCommand(command: ExternalExtensionLifecycleCommand): ExternalExtensionLifecycleCommand {
  if (command.operation === "append") {
    return { operation: "append", request: projectAppend(command.request) };
  }
  return { operation: command.operation, stream: projectStream(command.stream) };
}

/**
 * Route one lifecycle command to the exact stream-scoped Durable Object.
 * Caller-only properties are projected out before serialization, so secrets, product rows, hidden
 * reasoning, and other structurally compatible extras cannot cross the persistence boundary.
 * @param env Worker environment containing the canonical lifecycle Durable Object namespace.
 * @param command Lifecycle append or read command projected before crossing the persistence boundary.
 * @returns The response from the exact stream-scoped Durable Object command endpoint.
 */
export async function routeExternalExtensionLifecycleCommand(
  env: ExternalExtensionLifecycleDurableObjectEnv,
  command: ExternalExtensionLifecycleCommand,
): Promise<Response> {
  const projected = projectedTransportCommand(command);
  const stream = projected.operation === "append" ? projected.request.stream : projected.stream;
  const objectName = await externalExtensionLifecycleObjectName(stream);
  const objectId = env.NOEMA_EXTERNAL_EXTENSION_LIFECYCLE.idFromName(objectName);
  const stub = env.NOEMA_EXTERNAL_EXTENSION_LIFECYCLE.get(objectId);
  return stub.fetch(LIFECYCLE_INTERNAL_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(projected),
  });
}

/** Read only the exact-object SQLite byte counter needed by the operability evidence producer. */
function readDatabaseSizeBytes(storage: DurableObjectStorage): number {
  const databaseSize = storage.sql.databaseSize;
  if (!Number.isSafeInteger(databaseSize) || databaseSize < 0) {
    throw new Error("lifecycle Durable Object database size is unavailable");
  }
  return databaseSize;
}

/**
 * Cloudflare Durable Object adapter for one exact external-extension lifecycle stream.
 *
 * It owns only transport routing and storage binding. The repository owns transition/CAS/audit
 * invariants. No production evidence verifier is injected yet, so a new `active` transition remains
 * fail-closed until a reviewed Noema Policy/Approval + foreign-owner evidence adapter is available.
 */
export class NoemaExternalExtensionLifecycle {
  private readonly repository: DurableExternalExtensionLifecycleRepository;
  private readonly storage: DurableObjectStorage;
  private readonly objectName: string | undefined;

  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.repository = new DurableExternalExtensionLifecycleRepository(state.storage);
    this.objectName = state.id.name;
  }

  /** Enforce the private command envelope, exact object authority, and normalized fail-closed errors. */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST" || request.url !== LIFECYCLE_INTERNAL_ENDPOINT) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 404);
    }
    if (!isJsonMediaType(request.headers.get("content-type"))) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 415);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }
    if (!isRecord(raw) || typeof raw.operation !== "string") {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    try {
      let stream: ExternalExtensionLifecycleStreamIdentity;
      let data: ExternalExtensionLifecycleCommandData;
      switch (raw.operation) {
        case "append": {
          const append = projectAppend(raw.request);
          stream = append.stream;
          const expectedObjectName = await externalExtensionLifecycleObjectName(stream);
          if (this.objectName !== expectedObjectName) {
            throw new ExternalExtensionLifecycleConflictError(
              "lifecycle command does not match this Durable Object stream authority",
            );
          }
          data = await this.repository.append(append);
          break;
        }
        case "read_current":
          stream = projectStream(raw.stream);
          if (this.objectName !== await externalExtensionLifecycleObjectName(stream)) {
            throw new ExternalExtensionLifecycleConflictError(
              "lifecycle command does not match this Durable Object stream authority",
            );
          }
          data = await this.repository.readCurrent(stream);
          break;
        case "read_audit":
          stream = projectStream(raw.stream);
          if (this.objectName !== await externalExtensionLifecycleObjectName(stream)) {
            throw new ExternalExtensionLifecycleConflictError(
              "lifecycle command does not match this Durable Object stream authority",
            );
          }
          data = await this.repository.readAudit(stream);
          break;
        case "read_operability":
          stream = projectStream(raw.stream);
          if (this.objectName !== await externalExtensionLifecycleObjectName(stream)) {
            throw new ExternalExtensionLifecycleConflictError(
              "lifecycle command does not match this Durable Object stream authority",
            );
          }
          data = { database_size_bytes: readDatabaseSizeBytes(this.storage) };
          break;
        default:
          return jsonResponse({ ok: false, error: "invalid_request" }, 400);
      }
      return jsonResponse({ ok: true, data }, 200);
    } catch (error) {
      if (error instanceof ExternalExtensionLifecycleValidationError) {
        return jsonResponse({ ok: false, error: "invalid_request" }, 400);
      }
      if (error instanceof ExternalExtensionLifecycleConflictError) {
        return jsonResponse({ ok: false, error: "conflict" }, 409);
      }
      if (error instanceof ExternalExtensionLifecycleEvidenceError) {
        return jsonResponse({ ok: false, error: "evidence_unavailable" }, 412);
      }
      return jsonResponse({ ok: false, error: "internal_error" }, 500);
    }
  }
}
