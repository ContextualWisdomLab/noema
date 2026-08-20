const CLAIM_KEY = "oidc-token-claim";
const MAX_JTI_LENGTH = 256;
const MAX_TOKEN_LIFETIME_SECONDS = 3_600;
const ALARM_GRACE_MS = 30_000;
const REPLAY_GUARD_FETCH_TIMEOUT_MS = 10_000;
const MAX_REPLAY_GUARD_DECISION_BYTES = 4_096;
const MAX_REPLAY_GUARD_REQUEST_BYTES = 512;
const trustedJtiPattern = /^[A-Za-z0-9._:-]+$/;
const replayDecisionKeys = new Set([
  "accepted",
  "expires_at_epoch_seconds",
]);

/**
 * Supplies the Cloudflare Durable Object namespace that owns replay-claim state.
 * The binding is optional at the type boundary so callers can fail closed when deployment wiring is absent.
 */
export interface OidcReplayProtectionEnv {
  NOEMA_OIDC_REPLAY_GUARD?: DurableObjectNamespace;
}

/**
 * Reports whether a single-use OIDC token claim was accepted and the authoritative expiry attached to that claim.
 * A rejected `accepted` value preserves the stored expiry so callers can distinguish replay from infrastructure failure.
 */
export type OidcReplayClaimDecision = {
  accepted: boolean;
  expires_at_epoch_seconds: number;
};

type StoredOidcClaim = {
  expires_at_epoch_seconds: number;
  first_used_at_epoch_seconds: number;
};

type ClaimRequestReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "malformed_json" | "request_too_large" };

/**
 * Signals a confirmed OIDC replay after an atomic claim finds a still-live prior use.
 * The original expiry remains available for bounded diagnostics without disclosing the bearer token itself.
 */
export class OidcReplayDetected extends Error {
  constructor(public readonly expiresAtEpochSeconds: number) {
    super("GitHub Actions OIDC token has already been used");
    this.name = "OidcReplayDetected";
    Object.setPrototypeOf(this, OidcReplayDetected.prototype);
  }
}

/**
 * Signals that replay protection cannot produce a trustworthy decision and therefore must fail closed.
 * This covers missing bindings, malformed responses, invalid expiry windows, and Durable Object failures.
 */
export class OidcReplayUnavailable extends Error {
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

function normalizedMediaType(contentType: string | null): string {
  return (contentType ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
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
 * Derives the stable, non-secret Durable Object name used to serialize claims for one OIDC `jti`.
 * @param jti Unique JWT identifier supplied by the already-validated OIDC token.
 * @returns A SHA-256 hash-derived object name that never embeds the raw token identifier.
 * @throws {OidcReplayUnavailable} When the identifier is empty, oversized, or outside the accepted character set.
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

function hasDuplicateReplayDecisionKey(text: string): boolean {
  let structureDepth = 0;
  let stringStart = -1;
  let inString = false;
  let escaped = false;
  const seen = new Set<string>();

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (character === "\\") {
        escaped = true;
        continue;
      }
      if (character !== '"') continue;

      inString = false;
      if (structureDepth !== 1) continue;
      let lookahead = index + 1;
      while (lookahead < text.length && /\s/.test(text[lookahead]!)) lookahead += 1;
      if (text[lookahead] !== ":") continue;

      const encodedKey = text.slice(stringStart + 1, index);
      try {
        const decodedKey = JSON.parse(`"${encodedKey}"`) as string;
        if (!replayDecisionKeys.has(decodedKey)) continue;
        if (seen.has(decodedKey)) return true;
        seen.add(decodedKey);
      } catch {
        return false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      stringStart = index;
      continue;
    }
    if (character === "{" || character === "[") {
      structureDepth += 1;
      continue;
    }
    if (character === "}" || character === "]") {
      structureDepth -= 1;
    }
  }
  return false;
}

function ignoreReplayCleanupBestEffort(cancel: () => Promise<void>): void {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // Cleanup is best-effort after the replay decision has already crossed a fail-closed rejection boundary.
  }
}

async function readBoundedReplayDecision(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_REPLAY_GUARD_DECISION_BYTES
  ) {
    if (response.body !== null) {
      ignoreReplayCleanupBestEffort(() => response.body!.cancel(
        "Noema replay decision exceeds byte limit",
      ));
    }
    throw new OidcReplayUnavailable(
      "OIDC replay guard decision exceeds the response byte limit",
    );
  }
  if (response.body === null) {
    throw new OidcReplayUnavailable("OIDC replay guard returned an empty decision body");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REPLAY_GUARD_DECISION_BYTES) {
        ignoreReplayCleanupBestEffort(() => reader.cancel(
          "Noema replay decision exceeds byte limit",
        ));
        throw new OidcReplayUnavailable(
          "OIDC replay guard decision exceeds the response byte limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof OidcReplayUnavailable) throw error;
    throw new OidcReplayUnavailable("OIDC replay guard decision body could not be read");
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new OidcReplayUnavailable("OIDC replay guard decision is not valid UTF-8");
  }
  if (hasDuplicateReplayDecisionKey(text)) {
    throw new OidcReplayUnavailable(
      "OIDC replay guard decision contains duplicate decoded keys",
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new OidcReplayUnavailable("OIDC replay guard returned non-JSON data");
  }
}

async function readBoundedClaimRequest(request: Request): Promise<ClaimRequestReadResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_REPLAY_GUARD_REQUEST_BYTES
  ) {
    if (request.body !== null) {
      ignoreReplayCleanupBestEffort(() => request.body!.cancel(
        "Noema replay claim exceeds byte limit",
      ));
    }
    return { ok: false, status: 413, error: "request_too_large" };
  }
  if (request.body === null) {
    return { ok: false, status: 400, error: "malformed_json" };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_REPLAY_GUARD_REQUEST_BYTES) {
        ignoreReplayCleanupBestEffort(() => reader.cancel(
          "Noema replay claim exceeds byte limit",
        ));
        return { ok: false, status: 413, error: "request_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, status: 400, error: "malformed_json" };
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return { ok: false, status: 400, error: "malformed_json" };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "malformed_json" };
  }
}

/**
 * Atomically claims one validated GitHub Actions OIDC token before privileged credential exchange can continue.
 * @param jti Unique token identifier used only to derive the replay-guard object name.
 * @param expiresAtEpochSeconds Validated token expiry that bounds how long replay state is retained.
 * @param env Environment containing the required replay-protection Durable Object namespace.
 * @returns The accepted claim decision with the exact expiry echoed by the replay guard.
 * @throws {OidcReplayDetected} When the same live token identifier has already been claimed.
 * @throws {OidcReplayUnavailable} When replay authority is missing, malformed, mismatched, or otherwise unavailable.
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
      signal: AbortSignal.timeout(REPLAY_GUARD_FETCH_TIMEOUT_MS),
    });

    if (normalizedMediaType(response.headers.get("content-type")) !== "application/json") {
      if (response.body !== null) {
        ignoreReplayCleanupBestEffort(() => response.body!.cancel(
          "Noema replay decision content type is not accepted",
        ));
      }
      throw new OidcReplayUnavailable("OIDC replay guard returned an unexpected content type");
    }

    const body = await readBoundedReplayDecision(response);
    if (!isClaimDecision(body)) {
      throw new OidcReplayUnavailable("OIDC replay guard returned an invalid decision");
    }
    if (body.expires_at_epoch_seconds !== expiresAtEpochSeconds) {
      throw new OidcReplayUnavailable("OIDC replay guard returned a mismatched expiry");
    }
    if (response.status === 409 && !body.accepted) {
      throw new OidcReplayDetected(body.expires_at_epoch_seconds);
    }
    if (response.status !== 201 || !body.accepted) {
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
 * Cloudflare Durable Object that provides the atomic single-use authority for GitHub Actions OIDC tokens.
 * Storage transactions ensure concurrent claims cannot both succeed, while alarms bound retention to token expiry.
 */
export class NoemaOidcReplayGuard {
  constructor(private readonly state: DurableObjectState) {}

  /**
   * Applies the fail-closed replay claim protocol to the internal Durable Object endpoint.
   * @param request Internal POST request carrying only the validated token expiry, never the bearer token.
   * @returns A JSON response whose 201 or 409 status reflects the atomic replay decision; replay-boundary validation returns 404 for the wrong path or method, 415 for a non-JSON media type, 413 for a request above the internal byte limit, and 400 for malformed JSON or an invalid expiration value.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/claim") {
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }
    if (normalizedMediaType(request.headers.get("content-type")) !== "application/json") {
      return jsonResponse({ ok: false, error: "content_type_required" }, 415);
    }

    const requestRead = await readBoundedClaimRequest(request);
    if (!requestRead.ok) {
      return jsonResponse({ ok: false, error: requestRead.error }, requestRead.status);
    }
    const body = requestRead.value;

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
      await transaction.setAlarm(
        expiresAtEpochSeconds * 1_000 + ALARM_GRACE_MS,
      );
      return {
        accepted: true,
        expires_at_epoch_seconds: expiresAtEpochSeconds,
      } satisfies OidcReplayClaimDecision;
    });

    return jsonResponse(decision, decision.accepted ? 201 : 409);
  }

  /**
   * Removes expired replay state or reschedules cleanup atomically with the record it observed.
   * @returns A promise that resolves after cleanup or alarm reschedule has been committed in the storage transaction.
   */
  async alarm(): Promise<void> {
    const nowEpochSeconds = Math.floor(Date.now() / 1_000);
    await this.state.storage.transaction(async (transaction) => {
      const existing = await transaction.get<StoredOidcClaim>(CLAIM_KEY);
      if (!existing) return;
      if (existing.expires_at_epoch_seconds > nowEpochSeconds) {
        await transaction.setAlarm(
          existing.expires_at_epoch_seconds * 1_000 + ALARM_GRACE_MS,
        );
        return;
      }
      await this.state.storage.deleteAll();
    });
  }
}
