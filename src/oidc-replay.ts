const CLAIM_KEY = "oidc-token-claim";
const MAX_JTI_LENGTH = 256;
const MAX_TOKEN_LIFETIME_SECONDS = 3_600;
const ALARM_GRACE_MS = 30_000;
const trustedJtiPattern = /^[A-Za-z0-9._:-]+$/;

/**
 * Runtime binding used by Noema's OIDC replay-protection boundary.
 * The Durable Object namespace is optional at the type level so misconfigured
 * deployments can be detected explicitly and refused rather than assumed safe.
 */
export interface OidcReplayProtectionEnv {
  /** Durable Object namespace that atomically records one-time OIDC token usage. */
  NOEMA_OIDC_REPLAY_GUARD?: DurableObjectNamespace;
}

/**
 * Authoritative replay-claim result returned by the Durable Object.
 * `accepted` records whether this token use won the atomic claim, while the
 * expiry identifies how long the corresponding replay evidence remains live.
 */
export type OidcReplayClaimDecision = {
  /** Whether this invocation successfully claimed the token for first use. */
  accepted: boolean;
  /** Unix epoch second at which the recorded token claim expires. */
  expires_at_epoch_seconds: number;
};

type StoredOidcClaim = {
  expires_at_epoch_seconds: number;
  first_used_at_epoch_seconds: number;
};

type ReplayAlarmDecision =
  | { action: "delete" }
  | { action: "reschedule"; expires_at_epoch_seconds: number };

/**
 * Error raised when the atomic replay guard proves that a GitHub Actions OIDC
 * token was already used. The original claim expiry is retained so the caller
 * can bound diagnostics without exposing the token or its raw `jti` value.
 */
export class OidcReplayDetected extends Error {
  /**
   * Creates a replay-detected error for the still-live token claim.
   * @param expiresAtEpochSeconds Unix epoch second at which the prior claim expires.
   */
  constructor(public readonly expiresAtEpochSeconds: number) {
    super("GitHub Actions OIDC token has already been used");
    this.name = "OidcReplayDetected";
    Object.setPrototypeOf(this, OidcReplayDetected.prototype);
  }
}

/**
 * Fail-closed error raised when trustworthy replay evidence cannot be obtained.
 * Callers must refuse credential issuance on this path instead of treating a
 * storage, binding, validation, or transport failure as an unused token.
 */
export class OidcReplayUnavailable extends Error {
  /**
   * Creates a replay-unavailable failure with a diagnostic reason.
   * @param message Human-readable reason replay protection could not produce authoritative evidence.
   */
  constructor(message: string) {
    super(message);
    this.name = "OidcReplayUnavailable";
    Object.setPrototypeOf(this, OidcReplayUnavailable.prototype);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

function validJti(jti: string): boolean {
  return (
    jti.length > 0
    && jti.length <= MAX_JTI_LENGTH
    && trustedJtiPattern.test(jti)
  );
}

function validExpiry(expiresAtEpochSeconds: number, nowEpochSeconds: number): boolean {
  return (
    Number.isInteger(expiresAtEpochSeconds)
    && expiresAtEpochSeconds > nowEpochSeconds
    && expiresAtEpochSeconds <= nowEpochSeconds + MAX_TOKEN_LIFETIME_SECONDS
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives an opaque Durable Object name from the bounded OIDC `jti` claim.
 * SHA-256 hashing keeps the raw token identifier out of storage object names
 * while preserving a stable key for atomic replay detection.
 * @param jti GitHub Actions OIDC token identifier to validate and hash.
 * @returns The stable `oidc:<sha256>` Durable Object name for this token identifier.
 * @throws {OidcReplayUnavailable} When the `jti` is empty, oversized, or malformed.
 */
export async function oidcReplayObjectName(jti: string): Promise<string> {
  if (!validJti(jti)) {
    throw new OidcReplayUnavailable("OIDC jti claim is missing or malformed");
  }
  return `oidc:${await sha256Hex(jti)}`;
}

function isClaimDecision(value: unknown): value is OidcReplayClaimDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.accepted === "boolean"
    && Number.isInteger(candidate.expires_at_epoch_seconds)
    && Number(candidate.expires_at_epoch_seconds) > 0
  );
}

/**
 * Atomically claims a verified OIDC token for one-time use through the replay
 * Durable Object. The response body and expiry are validated before acceptance,
 * and every unavailable or contradictory result fails closed.
 * @param jti Verified bounded token identifier used only to derive the opaque replay key.
 * @param expiresAtEpochSeconds Verified token expiry, bounded to the accepted lifetime window.
 * @param env Runtime environment containing the replay-guard Durable Object binding.
 * @returns The authoritative accepted replay-claim decision.
 * @throws {OidcReplayDetected} When a still-live claim already exists for this token.
 * @throws {OidcReplayUnavailable} When replay protection cannot produce trustworthy evidence.
 */
export async function claimOidcTokenUsage(
  jti: string,
  expiresAtEpochSeconds: number,
  env: OidcReplayProtectionEnv,
): Promise<OidcReplayClaimDecision> {
  const namespace = env.NOEMA_OIDC_REPLAY_GUARD;
  if (!namespace) {
    throw new OidcReplayUnavailable("OIDC replay-guard binding is unavailable");
  }

  const nowEpochSeconds = Math.floor(Date.now() / 1_000);
  if (!validExpiry(expiresAtEpochSeconds, nowEpochSeconds)) {
    throw new OidcReplayUnavailable("OIDC exp claim is outside the accepted lifetime window");
  }

  try {
    const objectName = await oidcReplayObjectName(jti);
    const objectId = namespace.idFromName(objectName);
    const stub = namespace.get(objectId);
    const response = await stub.fetch("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
    });

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new OidcReplayUnavailable("OIDC replay guard returned non-JSON data");
    }
    if (!isClaimDecision(body)) {
      throw new OidcReplayUnavailable("OIDC replay guard returned an invalid decision");
    }
    if (body.expires_at_epoch_seconds !== expiresAtEpochSeconds) {
      throw new OidcReplayUnavailable("OIDC replay guard returned a mismatched expiry");
    }
    if (response.status === 409 && !body.accepted) {
      throw new OidcReplayDetected(body.expires_at_epoch_seconds);
    }
    if (!response.ok || !body.accepted) {
      throw new OidcReplayUnavailable(`OIDC replay guard returned HTTP ${response.status}`);
    }
    return body;
  } catch (error) {
    if (error instanceof OidcReplayDetected || error instanceof OidcReplayUnavailable) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new OidcReplayUnavailable(detail);
  }
}

function parseClaimRequest(value: unknown, nowEpochSeconds: number): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const expiresAt = (value as Record<string, unknown>).expires_at_epoch_seconds;
  if (typeof expiresAt !== "number" || !validExpiry(expiresAt, nowEpochSeconds)) {
    return undefined;
  }
  return expiresAt;
}

/**
 * Durable Object that serializes OIDC replay claims for one hashed token `jti`.
 * Its atomic storage transaction ensures concurrent credential exchanges cannot
 * both classify the same still-live token as unused.
 */
export class NoemaOidcReplayGuard {
  /**
   * Creates the replay guard around Cloudflare-provided atomic Durable Object storage.
   * @param state Authoritative state for the single hashed OIDC token claim bucket.
   */
  constructor(private readonly state: DurableObjectState) {}

  /**
   * Validates an internal `/claim` request and atomically records first token use.
   * A live prior claim returns the replay decision with HTTP 409; malformed input
   * is rejected without replacing trustworthy stored replay evidence.
   * @param request Internal JSON request containing the verified token expiry.
   * @returns A controlled JSON response describing acceptance or replay detection.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/claim") {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
      return jsonResponse({ ok: false, error: "content_type_required" }, 415);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ ok: false, error: "malformed_json" }, 400);
    }

    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const expiresAtEpochSeconds = parseClaimRequest(body, nowEpochSeconds);
    if (expiresAtEpochSeconds === undefined) {
      return jsonResponse({ ok: false, error: "invalid_expiry" }, 400);
    }

    const decision = await this.state.storage.transaction(async (transaction) => {
      const existing = await transaction.get<StoredOidcClaim>(CLAIM_KEY);
      if (existing && existing.expires_at_epoch_seconds > nowEpochSeconds) {
        return {
          accepted: false,
          expires_at_epoch_seconds: existing.expires_at_epoch_seconds,
        } satisfies OidcReplayClaimDecision;
      }

      await transaction.put(CLAIM_KEY, {
        expires_at_epoch_seconds: expiresAtEpochSeconds,
        first_used_at_epoch_seconds: nowEpochSeconds,
      } satisfies StoredOidcClaim);
      return {
        accepted: true,
        expires_at_epoch_seconds: expiresAtEpochSeconds,
      } satisfies OidcReplayClaimDecision;
    });

    if (decision.accepted) {
      await this.state.storage.setAlarm(
        decision.expires_at_epoch_seconds * 1_000 + ALARM_GRACE_MS,
      );
    }
    return jsonResponse(decision, decision.accepted ? 201 : 409);
  }

  /**
   * Performs bounded cleanup of expired replay evidence. An early alarm is
   * rescheduled to the authoritative claim expiry plus grace; otherwise cleanup
   * deletes the expired Durable Object storage for this token bucket.
   * @returns A promise that resolves after cleanup or reschedule state is persisted.
   */
  async alarm(): Promise<void> {
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    const decision = await this.state.storage.transaction(async (transaction) => {
      const existing = await transaction.get<StoredOidcClaim>(CLAIM_KEY);
      if (!existing) {
        return { action: "delete" } satisfies ReplayAlarmDecision;
      }
      if (existing.expires_at_epoch_seconds > nowEpochSeconds) {
        return {
          action: "reschedule",
          expires_at_epoch_seconds: existing.expires_at_epoch_seconds,
        } satisfies ReplayAlarmDecision;
      }
      return { action: "delete" } satisfies ReplayAlarmDecision;
    });

    if (decision.action === "reschedule") {
      await this.state.storage.setAlarm(
        decision.expires_at_epoch_seconds * 1_000 + ALARM_GRACE_MS,
      );
      return;
    }
    await this.state.storage.deleteAll();
  }
}
