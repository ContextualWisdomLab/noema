import { isJsonMediaType } from "../rate-limit";

const STATE_VERSION = "noema.continuation-dispatch-state.v1" as const;
const STATE_RECORD_KEY = "continuation-dispatch-state";
const INTERNAL_ENDPOINT = "https://noema-continuation-dispatch-state.internal/command";
// This private command and retained receipt inherit the released 8 KiB public mutation envelope.
const MAX_STATE_JSON_BYTES = 8_192;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/u;
const RESERVATION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const TERMINAL_OUTCOMES = new Set<ContinuationDispatchOutcome>([
  "accepted",
  "denied",
  "indeterminate",
]);

/**
 * Supplies the single Durable Object namespace that owns continuation-dispatch reservations.
 * The binding is mandatory because an absent serialization authority must never fall back in process.
 */
export interface ContinuationDispatchStateEnv {
  readonly NOEMA_CONTINUATION_DISPATCH_STATE: DurableObjectNamespace;
}

/**
 * Names the only persisted terminal results of one continuation dispatch attempt.
 * Indeterminate outcomes remain terminal because retrying could duplicate an external side effect.
 */
export type ContinuationDispatchOutcome = "accepted" | "denied" | "indeterminate";

/**
 * Describes the bounded JSON receipt persisted after one terminal dispatch attempt.
 * Task 4 supplies the released signed receipt schema while this boundary enforces its terminal outcome.
 */
export type ContinuationDispatchReceipt = Readonly<Record<string, unknown>> & {
  readonly outcome: ContinuationDispatchOutcome;
};

/**
 * Reports whether a caller owns a fresh reservation, observed an in-progress exact replay,
 * or received immutable evidence for a previously completed exact request.
 */
export type ContinuationDispatchReservation =
  | {
      readonly kind: "reserved";
      readonly identity: string;
      readonly digest: string;
      readonly reservationId: string;
    }
  | {
      readonly kind: "in_progress";
      readonly identity: string;
      readonly digest: string;
    }
  | {
      readonly kind: "replay";
      readonly identity: string;
      readonly digest: string;
      readonly outcome: ContinuationDispatchOutcome;
      readonly receipt: ContinuationDispatchReceipt;
    };

type NewReservation = Extract<ContinuationDispatchReservation, { kind: "reserved" }>;

type StoredDispatchState = {
  readonly version: typeof STATE_VERSION;
  readonly identity: string;
  readonly request_digest: string;
  readonly status: "reserved" | ContinuationDispatchOutcome;
  readonly reservation_id: string;
  readonly reservation_expires_at?: number;
  readonly receipt?: ContinuationDispatchReceipt;
};

type ReserveCommand = {
  readonly operation: "reserve";
  readonly identity: string;
  readonly digest: string;
  readonly reservation_expires_at: number;
};

type CommitCommand = {
  readonly operation: "commit";
  readonly identity: string;
  readonly digest: string;
  readonly reservation_id: string;
  readonly receipt: ContinuationDispatchReceipt;
};

type AbortCommand = {
  readonly operation: "abort";
  readonly identity: string;
  readonly digest: string;
  readonly reservation_id: string;
};

type FinalizeCommand = {
  readonly operation: "finalize";
  readonly identity: string;
  readonly digest: string;
  readonly reservation_id: string;
  readonly receipt: ContinuationDispatchReceipt;
};

type DispatchStateCommand = ReserveCommand | CommitCommand | AbortCommand | FinalizeCommand;

type CommandRead =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly status: 400 | 413; readonly error: "invalid_request" | "request_too_large" };

/** Signals that one logical continuation identity is already bound to different immutable authority. */
export class ContinuationDispatchStateConflict extends Error {
  /** Creates a stable fail-closed conflict without exposing retained receipt contents. */
  constructor(message = "continuation dispatch state conflicts with retained authority") {
    super(message);
    this.name = "ContinuationDispatchStateConflict";
    Object.setPrototypeOf(this, ContinuationDispatchStateConflict.prototype);
  }
}

/** Signals that the continuation state authority could not return a trustworthy decision. */
export class ContinuationDispatchStateUnavailable extends Error {
  /** Creates a stable infrastructure failure that callers must treat as non-authoritative. */
  constructor(message: string) {
    super(message);
    this.name = "ContinuationDispatchStateUnavailable";
    Object.setPrototypeOf(this, ContinuationDispatchStateUnavailable.prototype);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isDigest(value: unknown): value is string {
  return typeof value === "string" && DIGEST_PATTERN.test(value);
}

function isReservationId(value: unknown): value is string {
  return typeof value === "string" && RESERVATION_ID_PATTERN.test(value);
}

function isEpochSeconds(value: unknown): value is number {
  return Number.isSafeInteger(value)
    && (value as number) > 0
    && (value as number) <= Math.floor(Number.MAX_SAFE_INTEGER / 1_000);
}

function isOutcome(value: unknown): value is ContinuationDispatchOutcome {
  return typeof value === "string" && TERMINAL_OUTCOMES.has(value as ContinuationDispatchOutcome);
}

function isJsonValue(value: unknown): boolean {
  try {
    const pending: unknown[] = [value];
    const visited = new WeakSet<object>();
    while (pending.length > 0) {
      const current = pending.pop();
      if (
        current === null
        || typeof current === "string"
        || typeof current === "boolean"
        || (typeof current === "number" && Number.isFinite(current))
      ) {
        continue;
      }
      if (typeof current !== "object") return false;
      if (visited.has(current)) return false;
      visited.add(current);
      if (Array.isArray(current)) {
        pending.push(...current);
        continue;
      }
      if (Object.getPrototypeOf(current) !== Object.prototype) return false;
      pending.push(...Object.values(current as Record<string, unknown>));
    }
    return true;
  } catch {
    return false;
  }
}

function encodedJsonBytes(value: unknown): number | undefined {
  if (!isJsonValue(value)) return undefined;
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return undefined;
  }
}

function isReceipt(value: unknown): value is ContinuationDispatchReceipt {
  const encodedBytes = encodedJsonBytes(value);
  return (
    isRecord(value)
    && isOutcome(value.outcome)
    && encodedBytes !== undefined
    && encodedBytes <= MAX_STATE_JSON_BYTES
  );
}

function isStoredState(value: unknown): value is StoredDispatchState {
  if (!isRecord(value)) return false;
  if (
    value.version !== STATE_VERSION
    || !isDigest(value.identity)
    || !isDigest(value.request_digest)
    || !isReservationId(value.reservation_id)
  ) {
    return false;
  }
  if (value.status === "reserved") {
    return isEpochSeconds(value.reservation_expires_at)
      && hasExactKeys(value, [
        "version",
        "identity",
        "request_digest",
        "status",
        "reservation_id",
        "reservation_expires_at",
      ]);
  }
  const encodedBytes = encodedJsonBytes(value);
  return (
    isOutcome(value.status)
    && hasExactKeys(value, [
      "version",
      "identity",
      "request_digest",
      "status",
      "reservation_id",
      "receipt",
    ])
    && isReceipt(value.receipt)
    && value.receipt.outcome === value.status
    && encodedBytes !== undefined
    && encodedBytes <= MAX_STATE_JSON_BYTES
  );
}

function duplicateDecodedObjectKey(text: string): boolean {
  const stack: Array<{ readonly kind: "array" } | { readonly kind: "object"; readonly keys: Set<string> }> = [];
  let inString = false;
  let escaped = false;
  let stringStart = -1;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === "\"") {
        inString = false;
        const scope = stack[stack.length - 1];
        if (scope?.kind !== "object") continue;
        let lookahead = index + 1;
        while (lookahead < text.length && /\s/u.test(text[lookahead]!)) lookahead += 1;
        if (text[lookahead] !== ":") continue;
        const decoded = JSON.parse(`"${text.slice(stringStart + 1, index)}"`) as string;
        if (scope.keys.has(decoded)) return true;
        scope.keys.add(decoded);
      }
      continue;
    }
    if (character === "\"") {
      inString = true;
      stringStart = index;
    } else if (character === "{") {
      stack.push({ kind: "object", keys: new Set<string>() });
    } else if (character === "[") {
      stack.push({ kind: "array" });
    } else if (character === "}" || character === "]") {
      stack.pop();
    }
  }
  return false;
}

function ignoreCancellationBestEffort(cancel: () => Promise<void>): void {
  void Promise.resolve().then(cancel).catch(() => undefined);
}

function cancelBodyBestEffort(body: ReadableStream<Uint8Array> | null, reason: string): void {
  if (body !== null) ignoreCancellationBestEffort(() => body.cancel(reason));
}

async function readCommand(request: Request): Promise<CommandRead> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && (!/^(?:0|[1-9][0-9]*)$/u.test(declaredLength) || Number(declaredLength) > MAX_STATE_JSON_BYTES)
  ) {
    cancelBodyBestEffort(request.body, "continuation state request has an invalid declared length");
    return { ok: false, status: 413, error: "request_too_large" };
  }
  if (request.body === null) return { ok: false, status: 400, error: "invalid_request" };

  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = request.body.getReader();
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
  const storage = new Uint8Array(MAX_STATE_JSON_BYTES);
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength > MAX_STATE_JSON_BYTES - totalBytes) {
        ignoreCancellationBestEffort(() => reader.cancel("continuation state request exceeded its byte envelope"));
        return { ok: false, status: 413, error: "request_too_large" };
      }
      storage.set(result.value, totalBytes);
      totalBytes += result.value.byteLength;
    }
  } catch {
    ignoreCancellationBestEffort(() => reader.cancel("continuation state request body could not be read"));
    return { ok: false, status: 400, error: "invalid_request" };
  } finally {
    reader.releaseLock();
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(storage.subarray(0, totalBytes));
    const value = JSON.parse(text) as unknown;
    if (duplicateDecodedObjectKey(text)) {
      return { ok: false, status: 400, error: "invalid_request" };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
}

function parseCommand(value: unknown): DispatchStateCommand | undefined {
  if (!isRecord(value) || typeof value.operation !== "string") return undefined;
  if (value.operation === "reserve") {
    if (!hasExactKeys(value, ["operation", "identity", "digest", "reservation_expires_at"])) {
      return undefined;
    }
    if (
      !isDigest(value.identity)
      || !isDigest(value.digest)
      || !isEpochSeconds(value.reservation_expires_at)
    ) {
      return undefined;
    }
    return {
      operation: "reserve",
      identity: value.identity,
      digest: value.digest,
      reservation_expires_at: value.reservation_expires_at,
    };
  }
  if (value.operation === "commit") {
    if (!hasExactKeys(value, ["operation", "identity", "digest", "reservation_id", "receipt"])) {
      return undefined;
    }
    if (
      !isDigest(value.identity)
      || !isDigest(value.digest)
      || !isReservationId(value.reservation_id)
      || !isReceipt(value.receipt)
    ) {
      return undefined;
    }
    return {
      operation: "commit",
      identity: value.identity,
      digest: value.digest,
      reservation_id: value.reservation_id,
      receipt: value.receipt,
    };
  }
  if (value.operation === "abort") {
    if (!hasExactKeys(value, ["operation", "identity", "digest", "reservation_id"])) return undefined;
    if (!isDigest(value.identity) || !isDigest(value.digest) || !isReservationId(value.reservation_id)) {
      return undefined;
    }
    return {
      operation: "abort",
      identity: value.identity,
      digest: value.digest,
      reservation_id: value.reservation_id,
    };
  }
  if (value.operation === "finalize") {
    if (!hasExactKeys(value, ["operation", "identity", "digest", "reservation_id", "receipt"])) {
      return undefined;
    }
    if (
      !isDigest(value.identity)
      || !isDigest(value.digest)
      || !isReservationId(value.reservation_id)
      || !isReceipt(value.receipt)
      || value.receipt.outcome === "indeterminate"
    ) {
      return undefined;
    }
    return {
      operation: "finalize",
      identity: value.identity,
      digest: value.digest,
      reservation_id: value.reservation_id,
      receipt: value.receipt,
    };
  }
  return undefined;
}

function sameReceiptAuthority(
  retained: ContinuationDispatchReceipt,
  candidate: ContinuationDispatchReceipt,
): boolean {
  const omitted = new Set(["outcome", "signature", "upstream_status"]);
  const stable = (receipt: ContinuationDispatchReceipt) => Object.fromEntries(
    Object.entries(receipt).filter(([key]) => !omitted.has(key)),
  );
  return JSON.stringify(stable(retained)) === JSON.stringify(stable(candidate));
}

function jsonResponse(body: unknown, status = 200): Response {
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

function reservationFromStored(stored: StoredDispatchState): ContinuationDispatchReservation {
  if (stored.status === "reserved") {
    return { kind: "in_progress", identity: stored.identity, digest: stored.request_digest };
  }
  return {
    kind: "replay",
    identity: stored.identity,
    digest: stored.request_digest,
    outcome: stored.status,
    receipt: stored.receipt!,
  };
}

function isReservation(value: unknown): value is ContinuationDispatchReservation {
  if (!isRecord(value) || !isDigest(value.identity) || !isDigest(value.digest)) return false;
  if (value.kind === "reserved") {
    return hasExactKeys(value, ["kind", "identity", "digest", "reservationId"])
      && isReservationId(value.reservationId);
  }
  if (value.kind === "in_progress") {
    return hasExactKeys(value, ["kind", "identity", "digest"]);
  }
  return value.kind === "replay"
    && hasExactKeys(value, ["kind", "identity", "digest", "outcome", "receipt"])
    && isOutcome(value.outcome)
    && isReceipt(value.receipt)
    && value.receipt.outcome === value.outcome;
}

async function readDecision(response: Response): Promise<unknown> {
  if (!isJsonMediaType(response.headers.get("content-type"))) {
    cancelBodyBestEffort(response.body, "continuation state response has an invalid content type");
    throw new ContinuationDispatchStateUnavailable("continuation state returned an invalid content type");
  }
  const declaredLength = response.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > MAX_STATE_JSON_BYTES) {
    cancelBodyBestEffort(response.body, "continuation state response exceeded its declared byte envelope");
    throw new ContinuationDispatchStateUnavailable("continuation state response exceeded its byte envelope");
  }
  if (response.body === null) {
    throw new ContinuationDispatchStateUnavailable("continuation state returned an empty decision");
  }
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try {
    reader = response.body.getReader();
  } catch {
    throw new ContinuationDispatchStateUnavailable("continuation state decision body could not be read");
  }
  const storage = new Uint8Array(MAX_STATE_JSON_BYTES);
  let totalBytes = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      if (result.value.byteLength > MAX_STATE_JSON_BYTES - totalBytes) {
        ignoreCancellationBestEffort(() => reader.cancel("continuation state response exceeded its byte envelope"));
        throw new ContinuationDispatchStateUnavailable("continuation state response exceeded its byte envelope");
      }
      storage.set(result.value, totalBytes);
      totalBytes += result.value.byteLength;
    }
    const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true })
      .decode(storage.subarray(0, totalBytes));
    if (duplicateDecodedObjectKey(text)) {
      throw new ContinuationDispatchStateUnavailable("continuation state returned ambiguous JSON");
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof ContinuationDispatchStateUnavailable) throw error;
    ignoreCancellationBestEffort(() => reader.cancel("continuation state response body could not be read"));
    throw new ContinuationDispatchStateUnavailable("continuation state returned malformed JSON");
  } finally {
    reader.releaseLock();
  }
}

async function stateStub(
  env: ContinuationDispatchStateEnv,
  identity: string,
): Promise<DurableObjectStub> {
  if (!isDigest(identity)) {
    throw new ContinuationDispatchStateUnavailable("continuation identity is not a lowercase SHA-256 digest");
  }
  try {
    const objectId = env.NOEMA_CONTINUATION_DISPATCH_STATE.idFromName(`continuation:${identity}`);
    return env.NOEMA_CONTINUATION_DISPATCH_STATE.get(objectId);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new ContinuationDispatchStateUnavailable(detail);
  }
}

/**
 * Atomically reserves one logical continuation identity or returns its exact retained state.
 * @param env Runtime binding for the continuation-dispatch Durable Object namespace.
 * @param identity Lowercase SHA-256 idempotency identity used only to select one serialization point.
 * @param digest Lowercase SHA-256 digest of the complete canonical request and workflow identity.
 * @param reservationExpiresAtEpochSeconds Exact OIDC authorization expiry that bounds crash recovery.
 * @returns A fresh reservation capability, an in-progress replay, or a completed immutable replay receipt.
 * @throws {ContinuationDispatchStateConflict} When the logical identity is retained with another digest.
 * @throws {ContinuationDispatchStateUnavailable} When binding, transport, parsing, or retained state is untrustworthy.
 */
export async function reserveContinuationDispatch(
  env: ContinuationDispatchStateEnv,
  identity: string,
  digest: string,
  reservationExpiresAtEpochSeconds: number,
): Promise<ContinuationDispatchReservation> {
  if (!isDigest(digest) || !isEpochSeconds(reservationExpiresAtEpochSeconds)) {
    throw new ContinuationDispatchStateUnavailable("continuation reservation request is not canonical");
  }
  const stub = await stateStub(env, identity);
  let response: Response;
  try {
    response = await stub.fetch(INTERNAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "reserve",
        identity,
        digest,
        reservation_expires_at: reservationExpiresAtEpochSeconds,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new ContinuationDispatchStateUnavailable(detail);
  }
  const decision = await readDecision(response);
  if (response.status === 409) throw new ContinuationDispatchStateConflict();
  if (response.status !== 200 && response.status !== 201) {
    throw new ContinuationDispatchStateUnavailable(`continuation state returned HTTP ${response.status}`);
  }
  if (!isRecord(decision) || !hasExactKeys(decision, ["ok", "data"]) || decision.ok !== true || !isReservation(decision.data)) {
    throw new ContinuationDispatchStateUnavailable("continuation state returned an invalid reservation");
  }
  if (decision.data.identity !== identity || decision.data.digest !== digest) {
    throw new ContinuationDispatchStateUnavailable("continuation state returned mismatched authority");
  }
  return decision.data;
}

/**
 * Commits one terminal receipt only for the capability returned by the first successful reservation.
 * @param env Runtime binding for the continuation-dispatch Durable Object namespace.
 * @param reservation Fresh reservation capability that owns the only allowed dispatch attempt.
 * @param receipt Bounded JSON receipt whose outcome is accepted, denied, or indeterminate.
 * @returns A promise that resolves only after the exact terminal state is durably committed.
 * @throws {ContinuationDispatchStateConflict} When the reservation is stale, wrong, or already terminal.
 * @throws {ContinuationDispatchStateUnavailable} When receipt, transport, parsing, or storage authority is untrustworthy.
 */
export async function commitContinuationOutcome(
  env: ContinuationDispatchStateEnv,
  reservation: NewReservation,
  receipt: ContinuationDispatchReceipt,
): Promise<void> {
  if (
    reservation.kind !== "reserved"
    || !isDigest(reservation.identity)
    || !isDigest(reservation.digest)
    || !isReservationId(reservation.reservationId)
    || !isReceipt(receipt)
  ) {
    throw new ContinuationDispatchStateUnavailable("continuation outcome is not canonical bounded JSON");
  }
  const stub = await stateStub(env, reservation.identity);
  let response: Response;
  try {
    response = await stub.fetch(INTERNAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "commit",
        identity: reservation.identity,
        digest: reservation.digest,
        reservation_id: reservation.reservationId,
        receipt,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new ContinuationDispatchStateUnavailable(detail);
  }
  const decision = await readDecision(response);
  if (response.status === 409) throw new ContinuationDispatchStateConflict();
  if (
    response.status !== 200
    || !isRecord(decision)
    || !hasExactKeys(decision, ["ok"])
    || decision.ok !== true
  ) {
    throw new ContinuationDispatchStateUnavailable(`continuation state returned HTTP ${response.status}`);
  }
}

/**
 * Releases a fresh reservation before any external side effect has been attempted.
 * @param env Runtime binding for the continuation-dispatch Durable Object namespace.
 * @param reservation Unguessable fresh reservation capability returned by reserve.
 * @returns A promise that resolves only after the exact reservation is removed.
 * @throws {ContinuationDispatchStateConflict} When the reservation is stale, wrong, or already terminal.
 * @throws {ContinuationDispatchStateUnavailable} When transport or storage authority is unavailable.
 */
export async function abortContinuationReservation(
  env: ContinuationDispatchStateEnv,
  reservation: NewReservation,
): Promise<void> {
  if (
    reservation.kind !== "reserved"
    || !isDigest(reservation.identity)
    || !isDigest(reservation.digest)
    || !isReservationId(reservation.reservationId)
  ) {
    throw new ContinuationDispatchStateUnavailable("continuation reservation is not canonical");
  }
  const stub = await stateStub(env, reservation.identity);
  let response: Response;
  try {
    response = await stub.fetch(INTERNAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "abort",
        identity: reservation.identity,
        digest: reservation.digest,
        reservation_id: reservation.reservationId,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new ContinuationDispatchStateUnavailable(detail);
  }
  const decision = await readDecision(response);
  if (response.status === 409) throw new ContinuationDispatchStateConflict();
  if (response.status !== 200 || !isRecord(decision) || !hasExactKeys(decision, ["ok"]) || decision.ok !== true) {
    throw new ContinuationDispatchStateUnavailable(`continuation state returned HTTP ${response.status}`);
  }
}

/**
 * Replaces a pre-dispatch indeterminate receipt with the exact accepted or denied result.
 * @param env Runtime binding for the continuation-dispatch Durable Object namespace.
 * @param reservation Original reservation capability retained across the dispatch attempt.
 * @param receipt Accepted or denied receipt with identical immutable authority fields.
 * @returns A promise that resolves only after the stronger terminal evidence is durable.
 * @throws {ContinuationDispatchStateConflict} When state or immutable receipt authority differs.
 * @throws {ContinuationDispatchStateUnavailable} When transport or storage authority is unavailable.
 */
export async function finalizeContinuationOutcome(
  env: ContinuationDispatchStateEnv,
  reservation: NewReservation,
  receipt: ContinuationDispatchReceipt,
): Promise<void> {
  if (
    reservation.kind !== "reserved"
    || !isDigest(reservation.identity)
    || !isDigest(reservation.digest)
    || !isReservationId(reservation.reservationId)
    || !isReceipt(receipt)
    || receipt.outcome === "indeterminate"
  ) {
    throw new ContinuationDispatchStateUnavailable("continuation final outcome is not canonical bounded JSON");
  }
  const stub = await stateStub(env, reservation.identity);
  let response: Response;
  try {
    response = await stub.fetch(INTERNAL_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: "finalize",
        identity: reservation.identity,
        digest: reservation.digest,
        reservation_id: reservation.reservationId,
        receipt,
      }),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new ContinuationDispatchStateUnavailable(detail);
  }
  const decision = await readDecision(response);
  if (response.status === 409) throw new ContinuationDispatchStateConflict();
  if (response.status !== 200 || !isRecord(decision) || !hasExactKeys(decision, ["ok"]) || decision.ok !== true) {
    throw new ContinuationDispatchStateUnavailable(`continuation state returned HTTP ${response.status}`);
  }
}

/**
 * Cloudflare Durable Object that serializes one logical continuation identity through reservation and terminal receipt.
 * Its closed private protocol preserves indeterminate outcomes so concurrent or retried callers never duplicate dispatch.
 */
export class NoemaContinuationDispatchState {
  private readonly storage: DurableObjectStorage;
  private readonly objectName: string | undefined;

  /** Creates one identity-scoped state authority from Cloudflare's Durable Object state. */
  constructor(state: DurableObjectState) {
    this.storage = state.storage;
    this.objectName = state.id.name;
  }

  /**
   * Applies one bounded reserve or commit command at the fixed private endpoint.
   * @param request Internal JSON command containing no bearer, App token, or private-key material.
   * @returns A closed JSON decision; corrupt state and storage faults fail closed without replacing evidence.
   */
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "POST" || request.url !== INTERNAL_ENDPOINT) {
      cancelBodyBestEffort(request.body, "continuation state request used the wrong endpoint or method");
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }
    if (!isJsonMediaType(request.headers.get("content-type"))) {
      cancelBodyBestEffort(request.body, "continuation state request requires JSON");
      return jsonResponse({ ok: false, error: "content_type_required" }, 415);
    }
    const read = await readCommand(request);
    if (!read.ok) return jsonResponse({ ok: false, error: read.error }, read.status);
    const command = parseCommand(read.value);
    if (command === undefined || this.objectName !== `continuation:${command.identity}`) {
      return jsonResponse({ ok: false, error: "invalid_request" }, 400);
    }

    try {
      if (command.operation === "reserve") {
        const decision = await this.storage.transaction(async (transaction) => {
          const stored = await transaction.get<unknown>(STATE_RECORD_KEY);
          if (stored !== undefined) {
            if (!isStoredState(stored)) return { kind: "invalid" } as const;
            if (
              stored.status === "reserved"
              && stored.reservation_expires_at! * 1_000 <= Date.now()
            ) {
              await transaction.delete(STATE_RECORD_KEY);
              await transaction.deleteAlarm();
            } else {
              if (stored.identity !== command.identity || stored.request_digest !== command.digest) {
                return { kind: "conflict" } as const;
              }
              return { kind: "existing", reservation: reservationFromStored(stored) } as const;
            }
          }
          if (command.reservation_expires_at * 1_000 <= Date.now()) {
            return { kind: "expired" } as const;
          }
          const reservationId = crypto.randomUUID();
          const next: StoredDispatchState = {
            version: STATE_VERSION,
            identity: command.identity,
            request_digest: command.digest,
            status: "reserved",
            reservation_id: reservationId,
            reservation_expires_at: command.reservation_expires_at,
          };
          await transaction.put(STATE_RECORD_KEY, next);
          await transaction.setAlarm(command.reservation_expires_at * 1_000);
          return {
            kind: "created",
            reservation: {
              kind: "reserved",
              identity: command.identity,
              digest: command.digest,
              reservationId,
            } satisfies NewReservation,
          } as const;
        });
        if (decision.kind === "invalid") return jsonResponse({ ok: false, error: "invalid_state" }, 500);
        if (decision.kind === "conflict" || decision.kind === "expired") {
          return jsonResponse({ ok: false, error: "conflict" }, 409);
        }
        return jsonResponse({ ok: true, data: decision.reservation }, decision.kind === "created" ? 201 : 200);
      }

      if (command.operation === "abort") {
        const aborted = await this.storage.transaction(async (transaction) => {
          const stored = await transaction.get<unknown>(STATE_RECORD_KEY);
          if (!isStoredState(stored)) return stored === undefined ? "conflict" : "invalid";
          if (
            stored.status !== "reserved"
            || stored.identity !== command.identity
            || stored.request_digest !== command.digest
            || stored.reservation_id !== command.reservation_id
          ) {
            return "conflict";
          }
          await transaction.delete(STATE_RECORD_KEY);
          await transaction.deleteAlarm();
          return "aborted";
        });
        if (aborted === "invalid") return jsonResponse({ ok: false, error: "invalid_state" }, 500);
        if (aborted === "conflict") return jsonResponse({ ok: false, error: "conflict" }, 409);
        return jsonResponse({ ok: true });
      }

      if (command.operation === "finalize") {
        const finalized = await this.storage.transaction(async (transaction) => {
          const stored = await transaction.get<unknown>(STATE_RECORD_KEY);
          if (!isStoredState(stored)) return stored === undefined ? "conflict" : "invalid";
          if (
            stored.status !== "indeterminate"
            || stored.identity !== command.identity
            || stored.request_digest !== command.digest
            || stored.reservation_id !== command.reservation_id
            || stored.receipt === undefined
            || !sameReceiptAuthority(stored.receipt, command.receipt)
          ) {
            return "conflict";
          }
          const next: StoredDispatchState = {
            ...stored,
            status: command.receipt.outcome,
            receipt: command.receipt,
          };
          if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_STATE_JSON_BYTES) return "invalid";
          await transaction.put(STATE_RECORD_KEY, next);
          return "finalized";
        });
        if (finalized === "invalid") return jsonResponse({ ok: false, error: "invalid_state" }, 500);
        if (finalized === "conflict") return jsonResponse({ ok: false, error: "conflict" }, 409);
        return jsonResponse({ ok: true });
      }

      const committed = await this.storage.transaction(async (transaction) => {
        const stored = await transaction.get<unknown>(STATE_RECORD_KEY);
        if (!isStoredState(stored)) return stored === undefined ? "conflict" : "invalid";
        if (
          stored.status !== "reserved"
          || stored.identity !== command.identity
          || stored.request_digest !== command.digest
          || stored.reservation_id !== command.reservation_id
        ) {
          return "conflict";
        }
        if (stored.reservation_expires_at! * 1_000 <= Date.now()) {
          await transaction.delete(STATE_RECORD_KEY);
          await transaction.deleteAlarm();
          return "conflict";
        }
        const next: StoredDispatchState = {
          version: stored.version,
          identity: stored.identity,
          request_digest: stored.request_digest,
          status: command.receipt.outcome,
          reservation_id: stored.reservation_id,
          receipt: command.receipt,
        };
        if (new TextEncoder().encode(JSON.stringify(next)).byteLength > MAX_STATE_JSON_BYTES) return "invalid";
        await transaction.put(STATE_RECORD_KEY, next);
        await transaction.deleteAlarm();
        return "committed";
      });
      if (committed === "invalid") return jsonResponse({ ok: false, error: "invalid_state" }, 500);
      if (committed === "conflict") return jsonResponse({ ok: false, error: "conflict" }, 409);
      return jsonResponse({ ok: true });
    } catch {
      return jsonResponse({ ok: false, error: "storage_unavailable" }, 503);
    }
  }

  /**
   * Recovers only an expired pre-dispatch reservation at its retained OIDC authorization boundary.
   * Terminal evidence is immutable, corrupt state fails closed, and a premature alarm is rescheduled exactly.
   * @returns A promise that resolves after cleanup or exact rescheduling is durably serialized.
   */
  async alarm(): Promise<void> {
    await this.storage.transaction(async (transaction) => {
      const stored = await transaction.get<unknown>(STATE_RECORD_KEY);
      if (stored === undefined) {
        await transaction.deleteAlarm();
        return;
      }
      if (!isStoredState(stored)) {
        throw new Error("continuation dispatch alarm found invalid retained state");
      }
      if (stored.status !== "reserved") {
        await transaction.deleteAlarm();
        return;
      }
      const expiresAtMilliseconds = stored.reservation_expires_at! * 1_000;
      if (expiresAtMilliseconds <= Date.now()) {
        await transaction.delete(STATE_RECORD_KEY);
        await transaction.deleteAlarm();
        return;
      }
      await transaction.setAlarm(expiresAtMilliseconds);
    });
  }
}
