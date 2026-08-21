const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const MAX_RATE_LIMIT_PER_MINUTE = 10_000;
const MAX_CLIENT_IDENTIFIER_LENGTH = 128;
const MAX_RATE_LIMIT_DECISION_BYTES = 4_096;
const MAX_RATE_LIMIT_REQUEST_BYTES = 256;
const RATE_LIMITER_FETCH_TIMEOUT_MS = 10_000;
const strictIpv4SegmentPattern = /^(0|[1-9][0-9]{0,2})$/;
const strictIpv6CharacterPattern = /^[0-9A-Fa-f:.]+$/;
const BUCKET_KEY = "exchange-rate-limit";
const rateLimitDecisionKeys = new Set([
  "allowed",
  "limit",
  "remaining",
  "retry_after_seconds",
]);
const rateLimitRequestKeys = new Set(["limit"]);
const storedRateLimitBucketKeys = new Set(["window_start_ms", "count"]);

/**
 * Provides the Cloudflare Durable Object namespace and optional per-minute limit used by distributed exchange throttling.
 * The binding is mandatory so production requests never silently fall back to a process-local or shared limiter.
 */
export interface DistributedRateLimitEnv {
  NOEMA_RATE_LIMIT_PER_MINUTE?: string;
  NOEMA_RATE_LIMITER: DurableObjectNamespace;
}

/**
 * Describes the authoritative distributed rate-limit result for one request, including whether it is allowed,
 * the configured limit, remaining capacity, and retry delay that a rejected caller should observe.
 */
export type DistributedRateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  retry_after_seconds: number;
};

type StoredRateLimitBucket = {
  window_start_ms: number;
  count: number;
};

type DurableObjectDecision = DistributedRateLimitDecision & {
  reset_at_ms: number;
  started_new_window: boolean;
};

type RateLimitRequestReadResult =
  | { ok: true; value: unknown }
  | { ok: false; status: 400 | 413; error: "malformed_json" | "request_too_large" };

/**
 * Signals that the distributed rate-limit authority cannot return a trustworthy decision and the caller must fail closed.
 * This includes malformed decisions, missing trusted client identity, transport errors, and Durable Object failures.
 */
export class DistributedRateLimitUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DistributedRateLimitUnavailable";
    Object.setPrototypeOf(this, DistributedRateLimitUnavailable.prototype);
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

/**
 * Tests whether a response Content-Type identifies JSON while tolerating ordinary media-type parameters.
 * @param raw Raw Content-Type header value from the trusted internal rate-limit response.
 * @returns `true` only when the normalized media type is exactly `application/json`.
 */
export function isJsonMediaType(raw: string | null): boolean {
  const mediaType = (raw ?? "").split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json";
}

/**
 * Normalizes an operator-supplied per-minute request limit into the bounded production configuration range.
 * @param raw Optional textual limit from deployment configuration.
 * @returns A positive integer no greater than the hard maximum, or the safe default when input is invalid.
 */
export function configuredDistributedRateLimit(raw: string | undefined): number {
  const parsed = Number(raw ?? String(DEFAULT_RATE_LIMIT_PER_MINUTE));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  const normalized = Math.floor(parsed);
  if (normalized <= 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  return Math.min(normalized, MAX_RATE_LIMIT_PER_MINUTE);
}

function canonicalIpv4(candidate: string): string | undefined {
  const segments = candidate.split(".");
  if (segments.length !== 4) return undefined;

  const normalized: string[] = [];
  for (const segment of segments) {
    if (!strictIpv4SegmentPattern.test(segment)) return undefined;
    const value = Number(segment);
    if (value > 255) return undefined;
    normalized.push(String(value));
  }
  return normalized.join(".");
}

function canonicalIpv6(candidate: string): string | undefined {
  if (!candidate.includes(":") || !strictIpv6CharacterPattern.test(candidate)) {
    return undefined;
  }

  try {
    const hostname = new URL(`http://[${candidate}]/`).hostname;
    if (!hostname.startsWith("[") || !hostname.endsWith("]")) return undefined;
    const normalized = hostname.slice(1, -1).toLowerCase();
    return normalized.includes(":") ? normalized : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts a canonical trusted client identifier only from Cloudflare's `CF-Connecting-IP` request header.
 * @param request Edge request whose Cloudflare-supplied client address is used for distributed bucketing.
 * @returns A canonical IPv4 or IPv6 address, or `undefined` when the trusted header is missing or malformed.
 */
export function trustedClientIdentifier(request: Request): string | undefined {
  const candidate = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (!candidate || candidate.length > MAX_CLIENT_IDENTIFIER_LENGTH) {
    return undefined;
  }
  return canonicalIpv4(candidate) ?? canonicalIpv6(candidate);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Derives the stable privacy-preserving Durable Object name for the trusted client represented by a request.
 * @param request Edge request carrying the trusted Cloudflare client-address header.
 * @returns A SHA-256 hash-derived bucket name that does not expose the raw client identifier.
 * @throws {DistributedRateLimitUnavailable} When no trustworthy client identifier can be established.
 */
export async function distributedRateLimitObjectName(request: Request): Promise<string> {
  const identifier = trustedClientIdentifier(request);
  if (!identifier) {
    throw new DistributedRateLimitUnavailable(
      "CF-Connecting-IP is missing or invalid; refusing to collapse requests into a shared fallback bucket",
    );
  }
  return `exchange:${await sha256Hex(identifier)}`;
}

function isDecision(value: unknown): value is DistributedRateLimitDecision {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (
    keys.length !== rateLimitDecisionKeys.size
    || keys.some((key) => !rateLimitDecisionKeys.has(key))
    || typeof candidate.allowed !== "boolean"
    || !Number.isInteger(candidate.limit)
    || Number(candidate.limit) <= 0
    || !Number.isInteger(candidate.remaining)
    || Number(candidate.remaining) < 0
    || Number(candidate.remaining) > Number(candidate.limit)
    || !Number.isInteger(candidate.retry_after_seconds)
    || Number(candidate.retry_after_seconds) < 0
    || Number(candidate.retry_after_seconds) > Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)
  ) {
    return false;
  }

  const limit = Number(candidate.limit);
  const remaining = Number(candidate.remaining);
  const retryAfterSeconds = Number(candidate.retry_after_seconds);
  return candidate.allowed
    ? retryAfterSeconds === 0 && remaining < limit
    : remaining === 0 && retryAfterSeconds > 0;
}

function hasDuplicateTrackedRateLimitKey(
  text: string,
  trackedKeys: ReadonlySet<string>,
): boolean {
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
        if (!trackedKeys.has(decodedKey)) continue;
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

function ignoreCancellationBestEffort(cancel: () => Promise<void>): void {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // Cleanup is best-effort after the response has already crossed a fail-closed rejection boundary.
  }
}

function cancelDecisionBodyBestEffort(response: Response, reason: string): void {
  if (response.body !== null) {
    ignoreCancellationBestEffort(() => response.body!.cancel(reason));
  }
}

async function readBoundedRateLimitRequest(request: Request): Promise<RateLimitRequestReadResult> {
  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_RATE_LIMIT_REQUEST_BYTES
  ) {
    if (request.body !== null) {
      ignoreCancellationBestEffort(() => request.body!.cancel(
        "Noema rate-limit request exceeds declared byte limit",
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
      if (totalBytes > MAX_RATE_LIMIT_REQUEST_BYTES) {
        ignoreCancellationBestEffort(() => reader.cancel(
          "Noema rate-limit request exceeds byte limit",
        ));
        return { ok: false, status: 413, error: "request_too_large" };
      }
      chunks.push(value);
    }
  } catch {
    ignoreCancellationBestEffort(() => reader.cancel(
      "Noema rate-limit request body could not be read",
    ));
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
  if (hasDuplicateTrackedRateLimitKey(text, rateLimitRequestKeys)) {
    return { ok: false, status: 400, error: "malformed_json" };
  }

  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: 400, error: "malformed_json" };
  }
}

async function readBoundedRateLimitDecision(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_RATE_LIMIT_DECISION_BYTES
  ) {
    cancelDecisionBodyBestEffort(
      response,
      "Noema rate-limit decision exceeds declared byte limit",
    );
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object decision exceeds the response byte limit",
    );
  }

  if (response.body === null) {
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object returned an empty decision body",
    );
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_RATE_LIMIT_DECISION_BYTES) {
        ignoreCancellationBestEffort(() => reader.cancel(
          "Noema rate-limit decision exceeds byte limit",
        ));
        throw new DistributedRateLimitUnavailable(
          "rate-limit Durable Object decision exceeds the response byte limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailable) throw error;
    ignoreCancellationBestEffort(() => reader.cancel(
      "Noema rate-limit decision body could not be read",
    ));
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object decision body could not be read",
    );
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
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object decision is not valid UTF-8",
    );
  }
  if (hasDuplicateTrackedRateLimitKey(text, rateLimitDecisionKeys)) {
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object decision contains duplicate decoded keys",
    );
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new DistributedRateLimitUnavailable(
      "rate-limit Durable Object returned malformed JSON",
    );
  }
}

/**
 * Obtains the authoritative distributed rate-limit decision from the client-specific Durable Object and validates it fail closed.
 * @param request Edge request used to derive the trusted client bucket without exposing credentials.
 * @param env Rate-limit environment containing the Durable Object namespace and bounded operator configuration.
 * @returns A validated allow/deny decision with remaining capacity and retry guidance.
 * @throws {DistributedRateLimitUnavailable} When identity, transport, media type, bounds, JSON, or decision validation fails.
 */
export async function checkDistributedRateLimit(
  request: Request,
  env: DistributedRateLimitEnv,
): Promise<DistributedRateLimitDecision> {
  try {
    const objectName = await distributedRateLimitObjectName(request);
    const objectId = env.NOEMA_RATE_LIMITER.idFromName(objectName);
    const stub = env.NOEMA_RATE_LIMITER.get(objectId);
    const expectedLimit = configuredDistributedRateLimit(env.NOEMA_RATE_LIMIT_PER_MINUTE);
    const response = await stub.fetch("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: expectedLimit }),
      signal: AbortSignal.timeout(RATE_LIMITER_FETCH_TIMEOUT_MS),
    });
    if (response.status !== 200) {
      cancelDecisionBodyBestEffort(
        response,
        "Noema rate-limit decision returned non-success status",
      );
      throw new DistributedRateLimitUnavailable(
        `rate-limit Durable Object returned HTTP ${response.status}`,
      );
    }
    if (!isJsonMediaType(response.headers.get("content-type"))) {
      cancelDecisionBodyBestEffort(
        response,
        "Noema rate-limit decision content type is not accepted",
      );
      throw new DistributedRateLimitUnavailable(
        "rate-limit Durable Object returned an invalid content type",
      );
    }
    const body = await readBoundedRateLimitDecision(response);
    if (!isDecision(body)) {
      throw new DistributedRateLimitUnavailable(
        "rate-limit Durable Object returned an invalid decision",
      );
    }
    if (body.limit !== expectedLimit) {
      throw new DistributedRateLimitUnavailable(
        "rate-limit Durable Object decision does not match the configured limit",
      );
    }
    return body;
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailable) throw error;
    const detail = error instanceof Error ? error.message : "unknown Durable Object failure";
    throw new DistributedRateLimitUnavailable(detail);
  }
}

function parseLimitRequest(value: unknown): number | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  if (keys.length !== rateLimitRequestKeys.size || keys.some((key) => !rateLimitRequestKeys.has(key))) {
    return undefined;
  }
  const limit = candidate.limit;
  if (!Number.isInteger(limit)) return undefined;
  const numericLimit = Number(limit);
  if (numericLimit <= 0 || numericLimit > MAX_RATE_LIMIT_PER_MINUTE) return undefined;
  return numericLimit;
}

function isStoredRateLimitBucket(value: unknown): value is StoredRateLimitBucket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const keys = Object.keys(candidate);
  return (
    keys.length === storedRateLimitBucketKeys.size
    && keys.every((key) => storedRateLimitBucketKeys.has(key))
    && typeof candidate.window_start_ms === "number"
    && Number.isSafeInteger(candidate.window_start_ms)
    && candidate.window_start_ms > 0
    && typeof candidate.count === "number"
    && Number.isSafeInteger(candidate.count)
    && candidate.count >= 1
    && candidate.count <= MAX_RATE_LIMIT_PER_MINUTE
  );
}

/**
 * Cloudflare Durable Object implementing the atomic per-client fixed-window limiter used by the exchange boundary.
 * Transactional bucket updates prevent concurrent requests from bypassing the configured distributed rate limit.
 */
export class NoemaRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

  /**
   * Atomically checks and updates one client bucket while returning only the public fail-closed rate-limit decision.
   * @param request Internal JSON request carrying the validated limit for this Durable Object bucket.
   * @returns A JSON response with the 200 allow/deny decision; fail-closed validation returns 404 for the wrong path or method, 415 for a non-JSON media type, 413 for a request above the internal byte limit, 400 for malformed or ambiguous JSON or an invalid limit, and 500 for corrupt persisted limiter state.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") {
      if (request.body !== null) {
        ignoreCancellationBestEffort(() => request.body!.cancel(
          "Noema rate-limit request path or method is not accepted",
        ));
      }
      return jsonResponse({ ok: false, error: "not_found" }, 404);
    }
    if (!isJsonMediaType(request.headers.get("content-type"))) {
      if (request.body !== null) {
        ignoreCancellationBestEffort(() => request.body!.cancel(
          "Noema rate-limit request content type is not accepted",
        ));
      }
      return jsonResponse({ ok: false, error: "content_type_required" }, 415);
    }

    const requestRead = await readBoundedRateLimitRequest(request);
    if (!requestRead.ok) {
      return jsonResponse({ ok: false, error: requestRead.error }, requestRead.status);
    }
    const body = requestRead.value;
    const limit = parseLimitRequest(body);
    if (limit === undefined) {
      return jsonResponse({ ok: false, error: "invalid_limit" }, 400);
    }

    const now = Date.now();
    const decision = await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get<unknown>(BUCKET_KEY);
      if (
        stored !== undefined
        && (!isStoredRateLimitBucket(stored) || stored.window_start_ms > now)
      ) {
        await this.state.storage.deleteAll();
        return null;
      }
      const startsNewWindow = !stored || now - stored.window_start_ms >= RATE_LIMIT_WINDOW_MS;
      const windowStart = startsNewWindow ? now : stored.window_start_ms;
      const count = startsNewWindow ? 0 : stored.count;
      const resetAt = windowStart + RATE_LIMIT_WINDOW_MS;

      if (count >= limit) {
        const retryAfter = Math.max(1, Math.ceil((resetAt - now) / 1000));
        return {
          allowed: false,
          limit,
          remaining: 0,
          retry_after_seconds: retryAfter,
          reset_at_ms: resetAt,
          started_new_window: false,
        } satisfies DurableObjectDecision;
      }

      const nextCount = count + 1;
      await transaction.put(BUCKET_KEY, {
        window_start_ms: windowStart,
        count: nextCount,
      } satisfies StoredRateLimitBucket);
      if (startsNewWindow) {
        await this.state.storage.setAlarm(resetAt);
      }
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - nextCount),
        retry_after_seconds: 0,
        reset_at_ms: resetAt,
        started_new_window: startsNewWindow,
      } satisfies DurableObjectDecision;
    });

    if (decision === null) {
      return jsonResponse({ ok: false, error: "invalid_state" }, 500);
    }
    const { reset_at_ms: _resetAt, started_new_window: _started, ...publicDecision } = decision;
    return jsonResponse(publicDecision);
  }

  /**
   * Deletes an expired or corrupt rate-limit bucket, or reschedules cleanup when a valid active fixed window has not ended yet.
   * @returns A promise that resolves after cleanup or the required alarm reschedule has been committed in the storage transaction.
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get<unknown>(BUCKET_KEY);
      if (
        stored === undefined
        || !isStoredRateLimitBucket(stored)
        || stored.window_start_ms > now
      ) {
        await this.state.storage.deleteAll();
        return;
      }

      const resetAt = stored.window_start_ms + RATE_LIMIT_WINDOW_MS;
      if (resetAt > now) {
        await this.state.storage.setAlarm(resetAt);
        return;
      }
      await this.state.storage.deleteAll();
    });
  }
}
