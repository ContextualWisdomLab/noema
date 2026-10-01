import type { JwtPayload } from "../index";
import {
  canonicalContinuationRequest,
  continuationRequestDigest,
  dispatchMapping,
  type ContinuationDispatchRequest,
} from "./contract";
import type { CentralContinuationDispatchResult } from "./github-adapter";

const RECEIPT_VERSION = "noema.continuation-dispatch-receipt.v1" as const;
const SIGNATURE_ALGORITHM = "Ed25519" as const;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SHA_PATTERN = /^[0-9a-f]{40}$/u;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const KEY_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const TRACE_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/u;
const WORKFLOW_REF_PATTERN = /^[^\u0000-\u0020\u007f]+$/u;
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/u;
const FIELD_KEYS = [
  "dispatchResult",
  "emittedPayloadDigest",
  "idempotencyIdentity",
  "oidcLifetime",
  "receiptId",
  "request",
  "requestDigest",
  "traceId",
  "workflowRef",
  "workflowSha",
] as const;
const RECEIPT_KEYS = [
  "algorithm",
  "central_repository",
  "contract_version",
  "emitted_payload_digest",
  "event_type",
  "expires_at",
  "idempotency_identity",
  "issued_at",
  "key_id",
  "outcome",
  "pull_request_number",
  "receipt_id",
  "receipt_version",
  "request_digest",
  "signature",
  "source_base_ref",
  "source_base_sha",
  "source_head_sha",
  "source_repository",
  "trace_id",
  "transport_retry_attempt",
  "upstream_status",
  "workflow_ref",
  "workflow_sha",
] as const;

/**
 * Dedicated Worker secret bindings for continuation-receipt signing.
 * The private key never crosses the signing boundary, while the key id names the public verification key.
 */
export interface ContinuationReceiptSigningEnv {
  readonly CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM: string;
  readonly CONTINUATION_RECEIPT_SIGNING_KEY_ID: string;
}

/** Exact admitted values from which one credential-free continuation receipt is built. */
export interface ContinuationReceiptFields {
  readonly request: ContinuationDispatchRequest;
  readonly requestDigest: string;
  readonly idempotencyIdentity: string;
  readonly workflowRef: string;
  readonly workflowSha: string;
  readonly emittedPayloadDigest: string;
  readonly dispatchResult: CentralContinuationDispatchResult;
  readonly oidcLifetime: Pick<JwtPayload, "iat" | "exp">;
  readonly receiptId: string;
  readonly traceId: string;
}

/**
 * Signed v1 evidence for one exact, terminal continuation dispatch attempt.
 * The detached signature authenticates every credential-free field but grants no later dispatch authority.
 */
export interface SignedContinuationReceipt {
  readonly algorithm: typeof SIGNATURE_ALGORITHM;
  readonly central_repository: "ContextualWisdomLab/.github";
  readonly contract_version: "noema.continuation-dispatch.v1";
  readonly emitted_payload_digest: string;
  readonly event_type: "noema-review" | "strix-scan";
  readonly expires_at: number;
  readonly idempotency_identity: string;
  readonly issued_at: number;
  readonly key_id: string;
  readonly outcome: "accepted" | "denied" | "indeterminate";
  readonly pull_request_number: number;
  readonly receipt_id: string;
  readonly receipt_version: typeof RECEIPT_VERSION;
  readonly request_digest: string;
  readonly source_base_ref: string;
  readonly source_base_sha: string;
  readonly source_head_sha: string;
  readonly source_repository: string;
  readonly trace_id: string;
  readonly transport_retry_attempt: 1 | 2;
  readonly upstream_status: number | null;
  readonly workflow_ref: string;
  readonly workflow_sha: string;
  readonly signature: string;
}

type UnsignedContinuationReceipt = Omit<SignedContinuationReceipt, "signature">;

/** Fail-closed receipt construction error that never retains signing material. */
export class ContinuationReceiptError extends Error {
  /** Creates one stable receipt error without embedding candidate field values. */
  constructor(message: string) {
    super(message);
    this.name = "ContinuationReceiptError";
    Object.setPrototypeOf(this, ContinuationReceiptError.prototype);
  }
}

function rejectReceipt(message: string): never {
  throw new ContinuationReceiptError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function containsUnpairedSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (index + 1 >= value.length || nextCodeUnit < 0xdc00 || nextCodeUnit > 0xdfff) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function canonicalJson(value: Readonly<Record<string, string | number | null>>): string {
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${JSON.stringify(value[key])}`,
  ).join(",")}}`;
}

function pemDer(value: unknown, label: "PRIVATE KEY" | "PUBLIC KEY"): Uint8Array | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\r\n/gu, "\n");
  const match = new RegExp(
    `^-----BEGIN ${label}-----\\n([A-Za-z0-9+/=\\n]+)\\n-----END ${label}-----\\n?$`,
    "u",
  ).exec(normalized);
  if (match === null) return undefined;
  const encoded = match[1]!.replace(/\n/gu, "");
  try {
    const binary = atob(encoded);
    if (btoa(binary) !== encoded) return undefined;
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function encodeBase64Url(value: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(value));
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: unknown): Uint8Array | undefined {
  if (typeof value !== "string" || !BASE64URL_PATTERN.test(value)) return undefined;
  try {
    const padded = value.replace(/-/gu, "+").replace(/_/gu, "/")
      + "=".repeat((4 - value.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    return encodeBase64Url(bytes.buffer) === value ? bytes : undefined;
  } catch {
    return undefined;
  }
}

function canonicalOidcLifetime(value: unknown): { readonly iat: number; readonly exp: number } {
  if (
    !isRecord(value)
    || !hasExactKeys(value, ["exp", "iat"])
    || !Number.isSafeInteger(value.iat)
    || !Number.isSafeInteger(value.exp)
    || (value.iat as number) <= 0
    || (value.exp as number) <= (value.iat as number)
  ) {
    return rejectReceipt("continuation receipt OIDC lifetime must be one ordered positive integer interval");
  }
  return { iat: value.iat as number, exp: value.exp as number };
}

function canonicalDispatchResult(
  value: unknown,
  expectedEventType: "noema-review" | "strix-scan",
): CentralContinuationDispatchResult {
  if (!isRecord(value)) return rejectReceipt("continuation receipt dispatch result is not canonical");
  const hasStatus = Object.hasOwn(value, "upstreamStatus");
  if (!hasExactKeys(value, hasStatus ? ["eventType", "outcome", "upstreamStatus"] : ["eventType", "outcome"])) {
    return rejectReceipt("continuation receipt dispatch result members are not canonical");
  }
  if (value.eventType !== expectedEventType) {
    return rejectReceipt("continuation receipt event type does not match the released action");
  }
  if (value.outcome === "accepted" && value.upstreamStatus === 204) {
    return { outcome: "accepted", upstreamStatus: 204, eventType: expectedEventType };
  }
  if (
    value.outcome === "denied"
    && (value.upstreamStatus === 403 || value.upstreamStatus === 404 || value.upstreamStatus === 422)
  ) {
    return { outcome: "denied", upstreamStatus: value.upstreamStatus, eventType: expectedEventType };
  }
  if (
    value.outcome === "indeterminate"
    && (
      value.upstreamStatus === undefined
      || (Number.isSafeInteger(value.upstreamStatus)
        && (value.upstreamStatus as number) >= 100
        && (value.upstreamStatus as number) <= 599)
    )
  ) {
    return value.upstreamStatus === undefined
      ? { outcome: "indeterminate", eventType: expectedEventType }
      : { outcome: "indeterminate", upstreamStatus: value.upstreamStatus as number, eventType: expectedEventType };
  }
  return rejectReceipt("continuation receipt dispatch outcome is not canonical");
}

function canonicalUnsignedReceipt(value: Record<string, unknown>): UnsignedContinuationReceipt | undefined {
  if (
    value.algorithm !== SIGNATURE_ALGORITHM
    || value.central_repository !== "ContextualWisdomLab/.github"
    || value.contract_version !== "noema.continuation-dispatch.v1"
    || value.receipt_version !== RECEIPT_VERSION
    || typeof value.emitted_payload_digest !== "string"
    || !SHA256_PATTERN.test(value.emitted_payload_digest)
    || (value.event_type !== "noema-review" && value.event_type !== "strix-scan")
    || !Number.isSafeInteger(value.issued_at)
    || !Number.isSafeInteger(value.expires_at)
    || (value.issued_at as number) <= 0
    || (value.expires_at as number) <= (value.issued_at as number)
    || typeof value.idempotency_identity !== "string"
    || !SHA256_PATTERN.test(value.idempotency_identity)
    || typeof value.key_id !== "string"
    || !KEY_ID_PATTERN.test(value.key_id)
    || (value.outcome !== "accepted" && value.outcome !== "denied" && value.outcome !== "indeterminate")
    || !Number.isSafeInteger(value.pull_request_number)
    || (value.pull_request_number as number) <= 0
    || typeof value.receipt_id !== "string"
    || !UUID_V4_PATTERN.test(value.receipt_id)
    || typeof value.request_digest !== "string"
    || !SHA256_PATTERN.test(value.request_digest)
    || typeof value.source_base_ref !== "string"
    || value.source_base_ref.length === 0
    || typeof value.source_base_sha !== "string"
    || !SHA_PATTERN.test(value.source_base_sha)
    || typeof value.source_head_sha !== "string"
    || !SHA_PATTERN.test(value.source_head_sha)
    || typeof value.source_repository !== "string"
    || typeof value.trace_id !== "string"
    || !TRACE_ID_PATTERN.test(value.trace_id)
    || (value.transport_retry_attempt !== 1 && value.transport_retry_attempt !== 2)
    || typeof value.workflow_ref !== "string"
    || !WORKFLOW_REF_PATTERN.test(value.workflow_ref)
    || containsUnpairedSurrogate(value.workflow_ref)
    || typeof value.workflow_sha !== "string"
    || !SHA_PATTERN.test(value.workflow_sha)
  ) {
    return undefined;
  }
  if (
    (value.outcome === "accepted" && value.upstream_status !== 204)
    || (value.outcome === "denied" && value.upstream_status !== 403
      && value.upstream_status !== 404 && value.upstream_status !== 422)
    || (value.outcome === "indeterminate" && value.upstream_status !== null
      && (!Number.isSafeInteger(value.upstream_status)
        || (value.upstream_status as number) < 100 || (value.upstream_status as number) > 599))
  ) {
    return undefined;
  }
  return value as unknown as UnsignedContinuationReceipt;
}

function unsignedReceipt(receipt: unknown): UnsignedContinuationReceipt | undefined {
  if (!isRecord(receipt) || !hasExactKeys(receipt, RECEIPT_KEYS)) return undefined;
  const { signature: _signature, ...unsigned } = receipt;
  return canonicalUnsignedReceipt(unsigned);
}

/**
 * Creates one deterministic detached Ed25519 signature over the exact canonical v1 receipt.
 * OIDC issued-at and expiry are copied without introducing a broker timeout, and no credential enters the result.
 * @param fields Exact request, workflow, dispatch, digest, OIDC lifetime, and trace evidence.
 * @param env Dedicated Ed25519 PKCS#8 signing key and canonical public key identifier.
 * @returns A deeply immutable, credential-free signed continuation receipt.
 * @throws {ContinuationReceiptError} When any input, key, or signing operation is not canonical.
 */
export async function signContinuationReceipt(
  fields: ContinuationReceiptFields,
  env: ContinuationReceiptSigningEnv,
): Promise<SignedContinuationReceipt> {
  if (!isRecord(fields) || !hasExactKeys(fields, FIELD_KEYS)) {
    return rejectReceipt("continuation receipt fields must contain exactly the released members");
  }
  if (!isRecord(env)) return rejectReceipt("continuation receipt signing environment is not configured");
  canonicalContinuationRequest(fields.request, { workflow_sha: fields.workflowSha });
  if (!SHA256_PATTERN.test(fields.requestDigest) || !SHA256_PATTERN.test(fields.idempotencyIdentity)) {
    return rejectReceipt("continuation receipt request identity is not canonical");
  }
  if (
    fields.requestDigest
    !== await continuationRequestDigest(fields.request, { workflow_sha: fields.workflowSha })
  ) {
    return rejectReceipt("continuation receipt request digest does not bind the canonical request");
  }
  if (!SHA256_PATTERN.test(fields.emittedPayloadDigest)) {
    return rejectReceipt("continuation receipt emitted payload digest is not canonical");
  }
  if (
    typeof fields.workflowRef !== "string"
    || !WORKFLOW_REF_PATTERN.test(fields.workflowRef)
    || containsUnpairedSurrogate(fields.workflowRef)
  ) {
    return rejectReceipt("continuation receipt workflow ref is not canonical");
  }
  if (!UUID_V4_PATTERN.test(fields.receiptId) || !TRACE_ID_PATTERN.test(fields.traceId)) {
    return rejectReceipt("continuation receipt or trace identity is not canonical");
  }
  if (
    typeof env.CONTINUATION_RECEIPT_SIGNING_KEY_ID !== "string"
    || !KEY_ID_PATTERN.test(env.CONTINUATION_RECEIPT_SIGNING_KEY_ID)
  ) {
    return rejectReceipt("continuation receipt signing key id is not canonical");
  }

  const lifetime = canonicalOidcLifetime(fields.oidcLifetime);
  const eventType = dispatchMapping(fields.request.dispatch_action).eventType;
  const dispatchResult = canonicalDispatchResult(fields.dispatchResult, eventType);
  const unsigned: UnsignedContinuationReceipt = Object.freeze({
    algorithm: SIGNATURE_ALGORITHM,
    central_repository: fields.request.central_repository,
    contract_version: fields.request.contract_version,
    emitted_payload_digest: fields.emittedPayloadDigest,
    event_type: dispatchResult.eventType,
    expires_at: lifetime.exp,
    idempotency_identity: fields.idempotencyIdentity,
    issued_at: lifetime.iat,
    key_id: env.CONTINUATION_RECEIPT_SIGNING_KEY_ID,
    outcome: dispatchResult.outcome,
    pull_request_number: fields.request.pull_request_number,
    receipt_id: fields.receiptId,
    receipt_version: RECEIPT_VERSION,
    request_digest: fields.requestDigest,
    source_base_ref: fields.request.expected_base_ref,
    source_base_sha: fields.request.expected_base_sha,
    source_head_sha: fields.request.expected_head_sha,
    source_repository: fields.request.source_repository,
    trace_id: fields.traceId,
    transport_retry_attempt: fields.request.transport_retry_attempt,
    upstream_status: dispatchResult.upstreamStatus ?? null,
    workflow_ref: fields.workflowRef,
    workflow_sha: fields.workflowSha,
  });
  const der = pemDer(env.CONTINUATION_RECEIPT_SIGNING_PRIVATE_KEY_PEM, "PRIVATE KEY");
  if (der === undefined) return rejectReceipt("continuation receipt signing private key is not canonical PKCS8 PEM");

  try {
    const key = await crypto.subtle.importKey("pkcs8", der, SIGNATURE_ALGORITHM, false, ["sign"]);
    const signature = await crypto.subtle.sign(
      SIGNATURE_ALGORITHM,
      key,
      new TextEncoder().encode(canonicalJson(unsigned)),
    );
    return Object.freeze({ ...unsigned, signature: encodeBase64Url(signature) });
  } catch {
    return rejectReceipt("continuation receipt signing private key or operation is invalid");
  }
}

/**
 * Verifies one untrusted signed receipt with an Ed25519 SubjectPublicKeyInfo PEM key.
 * Malformed fields, unknown members, non-canonical base64url, key errors, and mutations return false.
 * @param receipt Candidate v1 receipt received from the broker or retained state.
 * @param publicKey Exact Ed25519 SPKI PEM public key from the released consumer contract.
 * @returns Whether the detached signature authenticates the complete canonical receipt.
 */
export async function verifyContinuationReceipt(
  receipt: unknown,
  publicKey: string,
): Promise<boolean> {
  if (!isRecord(receipt) || typeof receipt.signature !== "string") return false;
  const unsigned = unsignedReceipt(receipt);
  const signature = decodeBase64Url(receipt.signature);
  const der = pemDer(publicKey, "PUBLIC KEY");
  if (unsigned === undefined || signature === undefined || der === undefined) return false;
  try {
    const key = await crypto.subtle.importKey("spki", der, SIGNATURE_ALGORITHM, false, ["verify"]);
    return crypto.subtle.verify(
      SIGNATURE_ALGORITHM,
      key,
      signature,
      new TextEncoder().encode(canonicalJson(unsigned)),
    );
  } catch {
    return false;
  }
}
