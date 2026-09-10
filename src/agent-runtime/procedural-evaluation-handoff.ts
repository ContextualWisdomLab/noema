import {
  assertProceduralEvaluationEvidence,
  type ProceduralEvaluationEvidence,
} from "./procedural-evaluation-authority";
import {
  normalizeProceduralError,
  proceduralDigest,
  proceduralHash,
  proceduralIdentity,
  proceduralInteger,
  readProceduralRecord,
  rejectProceduralInput,
} from "./procedural-input";

const HANDOFF_SCHEMA_VERSION = "noema.procedural-evaluation-handoff/v1" as const;
const MAX_HANDOFF_LIFETIME_SECONDS = 300;
const MAX_FUTURE_CLOCK_SKEW_SECONDS = 30;
const MAX_EPOCH_SECONDS = 4_102_444_800;
const ECDSA_P256_SIGNATURE_BYTES = 64;
const ECDSA_P256_SIGNATURE_BASE64URL_LENGTH = 86;

/**
 * Signed evaluator handoff that binds one exact procedural evaluation envelope to a bounded validity
 * interval and an opaque signer key identity. The signature is verification evidence, not key custody.
 */
export interface ProceduralEvaluationHandoff {
  readonly schemaVersion: typeof HANDOFF_SCHEMA_VERSION;
  readonly envelopeDigest: string;
  readonly signerKeyId: string;
  readonly issuedAtEpochSeconds: number;
  readonly expiresAtEpochSeconds: number;
  readonly signature: string;
}

/**
 * Trusted verification input selected by the composition root from its external identity/key authority;
 * Agent Runtime consumes this public key but does not discover, rotate, store, or administer signer keys.
 */
export interface ProceduralEvaluationHandoffTrust {
  readonly signerKeyId: string;
  readonly verificationKey: CryptoKey;
}

/**
 * Process-local authority created only after the exact evaluation envelope is verified against the
 * separately trusted signer key and bounded handoff interval. It never grants policy or activation.
 */
export interface AuthenticatedProceduralEvaluationEvidence {
  readonly evidence: ProceduralEvaluationEvidence;
  readonly signerKeyId: string;
  readonly issuedAtEpochSeconds: number;
  readonly expiresAtEpochSeconds: number;
  readonly handoffDigest: string;
  readonly activationAuthorized: false;
}

const admittedAuthenticatedEvidence = new WeakSet<object>();

function parseSignature(value: unknown): Uint8Array {
  if (
    typeof value !== "string"
    || value.length !== ECDSA_P256_SIGNATURE_BASE64URL_LENGTH
    || !/^[A-Za-z0-9_-]+$/.test(value)
  ) {
    rejectProceduralInput("evaluation_handoff_signature_invalid");
  }
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/") + "==";
    const decoded = atob(base64);
    if (decoded.length !== ECDSA_P256_SIGNATURE_BYTES) {
      rejectProceduralInput("evaluation_handoff_signature_invalid");
    }
    const canonical = btoa(decoded)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");
    if (canonical !== value) {
      rejectProceduralInput("evaluation_handoff_signature_invalid");
    }
    return Uint8Array.from(decoded, character => character.charCodeAt(0));
  } catch {
    rejectProceduralInput("evaluation_handoff_signature_invalid");
  }
}

function parseHandoff(input: unknown): {
  handoff: ProceduralEvaluationHandoff;
  signatureBytes: Uint8Array;
} {
  const value = readProceduralRecord(input, [
    "schemaVersion",
    "envelopeDigest",
    "signerKeyId",
    "issuedAtEpochSeconds",
    "expiresAtEpochSeconds",
    "signature",
  ]);
  if (value.schemaVersion !== HANDOFF_SCHEMA_VERSION) rejectProceduralInput("unsupported_schema");
  const signatureBytes = parseSignature(value.signature);
  return {
    handoff: Object.freeze({
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      envelopeDigest: proceduralDigest(value.envelopeDigest),
      signerKeyId: proceduralIdentity(value.signerKeyId),
      issuedAtEpochSeconds: proceduralInteger(value.issuedAtEpochSeconds, 0, MAX_EPOCH_SECONDS),
      expiresAtEpochSeconds: proceduralInteger(value.expiresAtEpochSeconds, 0, MAX_EPOCH_SECONDS),
      signature: value.signature as string,
    }),
    signatureBytes,
  };
}

function parseTrust(input: unknown): ProceduralEvaluationHandoffTrust {
  const value = readProceduralRecord(input, ["signerKeyId", "verificationKey"]);
  if (value.verificationKey === null || typeof value.verificationKey !== "object") {
    rejectProceduralInput("evaluation_handoff_signature_invalid");
  }
  return Object.freeze({
    signerKeyId: proceduralIdentity(value.signerKeyId),
    verificationKey: value.verificationKey as CryptoKey,
  });
}

function signedMessage(handoff: ProceduralEvaluationHandoff): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    HANDOFF_SCHEMA_VERSION,
    handoff.envelopeDigest,
    handoff.signerKeyId,
    handoff.issuedAtEpochSeconds,
    handoff.expiresAtEpochSeconds,
  ]));
}

function assertHandoffTime(handoff: ProceduralEvaluationHandoff, nowEpochSeconds: number): void {
  if (handoff.expiresAtEpochSeconds <= nowEpochSeconds) {
    rejectProceduralInput("evaluation_handoff_expired");
  }
  if (
    handoff.issuedAtEpochSeconds > nowEpochSeconds + MAX_FUTURE_CLOCK_SKEW_SECONDS
    || handoff.expiresAtEpochSeconds <= handoff.issuedAtEpochSeconds
    || handoff.expiresAtEpochSeconds - handoff.issuedAtEpochSeconds > MAX_HANDOFF_LIFETIME_SECONDS
  ) {
    rejectProceduralInput("evaluation_handoff_time_invalid");
  }
}

async function verifySignature(
  verificationKey: CryptoKey,
  signatureBytes: Uint8Array,
  message: Uint8Array,
): Promise<void> {
  let verified = false;
  try {
    verified = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      verificationKey,
      signatureBytes,
      message,
    );
  } catch {
    rejectProceduralInput("evaluation_handoff_signature_invalid");
  }
  if (!verified) rejectProceduralInput("evaluation_handoff_signature_invalid");
}

/**
 * Verifies an exact signed evaluator handoff against a public verification key already selected by the
 * trusted composition root. This function does not resolve Keyverse identity, fetch credentials, persist
 * evidence, approve a candidate, publish a contract, or authorize activation.
 * @param evidence Locally admitted evaluation envelope whose exact digest must be signed by the evaluator.
 * @param handoffInput Exact-key signed handoff carrying signer identity, bounded time interval, and signature.
 * @param trustInput Separately trusted signer key id and public CryptoKey supplied by the composition root.
 * @returns Frozen process-local authenticated evidence that remains explicitly unauthorized for activation.
 */
export async function verifyProceduralEvaluationHandoff(
  evidence: ProceduralEvaluationEvidence,
  handoffInput: unknown,
  trustInput: unknown,
): Promise<AuthenticatedProceduralEvaluationEvidence> {
  try {
    assertProceduralEvaluationEvidence(evidence);
    const { handoff, signatureBytes } = parseHandoff(handoffInput);
    const trust = parseTrust(trustInput);
    if (handoff.signerKeyId !== trust.signerKeyId) {
      rejectProceduralInput("evaluation_handoff_signer_mismatch");
    }
    if (handoff.envelopeDigest !== evidence.envelopeDigest) {
      rejectProceduralInput("evaluation_handoff_envelope_mismatch");
    }
    const nowEpochSeconds = Math.floor(Date.now() / 1000);
    assertHandoffTime(handoff, nowEpochSeconds);
    await verifySignature(trust.verificationKey, signatureBytes, signedMessage(handoff));
    const authority = Object.freeze({
      evidence,
      signerKeyId: handoff.signerKeyId,
      issuedAtEpochSeconds: handoff.issuedAtEpochSeconds,
      expiresAtEpochSeconds: handoff.expiresAtEpochSeconds,
      handoffDigest: await proceduralHash([
        HANDOFF_SCHEMA_VERSION,
        handoff.envelopeDigest,
        handoff.signerKeyId,
        handoff.issuedAtEpochSeconds,
        handoff.expiresAtEpochSeconds,
        handoff.signature,
      ]),
      activationAuthorized: false as const,
    });
    admittedAuthenticatedEvidence.add(authority);
    return authority;
  } catch (error) {
    return normalizeProceduralError(error);
  }
}

/**
 * Requires process-local provenance and a still-current signed validity interval so structural copies,
 * serialized lookalikes, and expired handoffs cannot be mistaken for authenticated evaluator evidence.
 * @param value Unknown value proposed as authenticated procedural evaluation evidence.
 * @returns Returns normally only for this module's admitted unexpired object; otherwise throws a closed error.
 */
export function assertAuthenticatedProceduralEvaluationEvidence(
  value: unknown,
): asserts value is AuthenticatedProceduralEvaluationEvidence {
  if (value === null || typeof value !== "object" || !admittedAuthenticatedEvidence.has(value)) {
    rejectProceduralInput("unadmitted_authenticated_evaluation");
  }
  const authenticated = value as AuthenticatedProceduralEvaluationEvidence;
  if (authenticated.expiresAtEpochSeconds <= Math.floor(Date.now() / 1000)) {
    rejectProceduralInput("evaluation_handoff_expired");
  }
}
