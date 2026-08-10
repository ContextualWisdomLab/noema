const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const MAX_RATE_LIMIT_PER_MINUTE = 10_000;
const MAX_CLIENT_IDENTIFIER_LENGTH = 128;
const strictIpv4SegmentPattern = /^(0|[1-9][0-9]{0,2})$/;
const strictIpv6CharacterPattern = /^[0-9A-Fa-f:.]+$/;
const BUCKET_KEY = "exchange-rate-limit";

/**
 * Runtime bindings required by the distributed rate-limit boundary.
 * `NOEMA_RATE_LIMITER` is the Durable Object namespace that owns atomic counters,
 * while `NOEMA_RATE_LIMIT_PER_MINUTE` optionally selects the bounded request limit.
 */
export interface DistributedRateLimitEnv {
  /** Optional per-minute limit; invalid or non-positive values fall back to the safe default. */
  NOEMA_RATE_LIMIT_PER_MINUTE?: string;
  /** Durable Object namespace used to serialize rate-limit decisions for one trusted client. */
  NOEMA_RATE_LIMITER: DurableObjectNamespace;
}

/**
 * Public decision returned after a distributed rate-limit check.
 * `allowed` identifies whether work may continue, `remaining` reports the bounded
 * allowance left in the current window, and `retry_after_seconds` tells a denied
 * caller when retrying can become meaningful.
 */
export type DistributedRateLimitDecision = {
  /** Whether the request may cross the protected rate-limit boundary. */
  allowed: boolean;
  /** Effective maximum number of accepted requests in the active one-minute window. */
  limit: number;
  /** Non-negative number of requests still available in the active window. */
  remaining: number;
  /** Whole seconds a denied caller should wait before retrying. */
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

type AlarmDecision =
  | { action: "delete" }
  | { action: "reschedule"; reset_at_ms: number };

/**
 * Fail-closed error raised when Noema cannot obtain trustworthy distributed
 * rate-limit evidence. Callers must treat this error as refusal to continue,
 * rather than silently falling back to an uncoordinated local limiter.
 */
export class DistributedRateLimitUnavailable extends Error {
  /**
   * Creates a fail-closed rate-limit error with a diagnostic message.
   * @param message Human-readable reason the distributed decision is unavailable.
   */
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
 * Parses the operator-provided per-minute limit without allowing an unsafe or
 * unbounded value. Invalid input uses the documented default and oversized input
 * is capped at the repository maximum.
 * @param raw Optional textual environment value supplied by the deployment.
 * @returns The positive integer limit that the Durable Object may enforce.
 */
export function configuredDistributedRateLimit(raw: string | undefined): number {
  const parsed = Number(raw ?? String(DEFAULT_RATE_LIMIT_PER_MINUTE));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  return Math.min(Math.floor(parsed), MAX_RATE_LIMIT_PER_MINUTE);
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
 * Extracts and canonicalizes the Cloudflare-authenticated client address used as
 * the trusted partition key for abuse control. Arbitrary forwarding headers are
 * intentionally ignored; only `CF-Connecting-IP` participates in this boundary.
 * @param request Incoming Worker request whose trusted edge metadata is inspected.
 * @returns A canonical IPv4/IPv6 address, or `undefined` when the trusted value is absent or invalid.
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
 * Derives the opaque Durable Object name for one trusted client without exposing
 * the address itself in the storage key. The canonical client identifier is
 * hashed with SHA-256 before the `exchange:` namespace prefix is added.
 * @param request Incoming request containing trusted Cloudflare client metadata.
 * @returns The stable hashed object name used for the distributed counter.
 * @throws {DistributedRateLimitUnavailable} When no valid trusted client identifier exists.
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
  return (
    typeof candidate.allowed === "boolean"
    && Number.isInteger(candidate.limit)
    && Number(candidate.limit) > 0
    && Number.isInteger(candidate.remaining)
    && Number(candidate.remaining) >= 0
    && Number(candidate.remaining) <= Number(candidate.limit)
    && Number.isInteger(candidate.retry_after_seconds)
    && Number(candidate.retry_after_seconds) >= 0
  );
}

/**
 * Requests the authoritative distributed rate-limit decision for an incoming
 * exchange. The function validates the Durable Object response before returning
 * it and fails closed if routing, storage, transport, or response validation fails.
 * @param request Incoming request whose trusted client identity selects the bucket.
 * @param env Runtime bindings containing the configured limit and Durable Object namespace.
 * @returns The validated allow/deny decision for the current one-minute window.
 * @throws {DistributedRateLimitUnavailable} When no trustworthy distributed decision can be produced.
 */
export async function checkDistributedRateLimit(
  request: Request,
  env: DistributedRateLimitEnv,
): Promise<DistributedRateLimitDecision> {
  try {
    const objectName = await distributedRateLimitObjectName(request);
    const objectId = env.NOEMA_RATE_LIMITER.idFromName(objectName);
    const stub = env.NOEMA_RATE_LIMITER.get(objectId);
    const response = await stub.fetch("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        limit: configuredDistributedRateLimit(env.NOEMA_RATE_LIMIT_PER_MINUTE),
      }),
    });
    if (!response.ok) {
      throw new DistributedRateLimitUnavailable(
        `rate-limit Durable Object returned HTTP ${response.status}`,
      );
    }
    const body: unknown = await response.json();
    if (!isDecision(body)) {
      throw new DistributedRateLimitUnavailable(
        "rate-limit Durable Object returned an invalid decision",
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
  if (!value || typeof value !== "object") return undefined;
  const limit = (value as Record<string, unknown>).limit;
  if (!Number.isInteger(limit)) return undefined;
  const numericLimit = Number(limit);
  if (numericLimit <= 0 || numericLimit > MAX_RATE_LIMIT_PER_MINUTE) return undefined;
  return numericLimit;
}

/**
 * Durable Object implementation that owns atomic per-client rate-limit storage.
 * All request counters and alarm cleanup decisions are serialized through the
 * object storage transaction boundary rather than trusted to individual Workers.
 */
export class NoemaRateLimiter {
  /**
   * Creates the Durable Object around Cloudflare-provided transactional storage.
   * @param state Authoritative Durable Object state for this hashed client bucket.
   */
  constructor(private readonly state: DurableObjectState) {}

  /**
   * Validates an internal rate-limit request and atomically advances the current
   * window. Malformed methods, content types, JSON, or limits fail without
   * mutating the bucket, while valid requests return a cache-resistant decision.
   * @param request Internal `/check` request containing the configured positive limit.
   * @returns A JSON response containing the public decision or a fail-closed validation error.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "POST" || url.pathname !== "/check") {
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
    const limit = parseLimitRequest(body);
    if (limit === undefined) {
      return jsonResponse({ ok: false, error: "invalid_limit" }, 400);
    }

    const now = Date.now();
    const decision = await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get<StoredRateLimitBucket>(BUCKET_KEY);
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
      return {
        allowed: true,
        limit,
        remaining: Math.max(0, limit - nextCount),
        retry_after_seconds: 0,
        reset_at_ms: resetAt,
        started_new_window: startsNewWindow,
      } satisfies DurableObjectDecision;
    });

    if (decision.started_new_window) {
      await this.state.storage.setAlarm(decision.reset_at_ms);
    }

    const { reset_at_ms: _resetAt, started_new_window: _started, ...publicDecision } = decision;
    return jsonResponse(publicDecision);
  }

  /**
   * Performs bounded cleanup after a rate-limit window expires. If an alarm fires
   * before the authoritative reset time, cleanup is deferred and the alarm is
   * rescheduled; otherwise the expired object storage is deleted.
   * @returns A promise that resolves after cleanup or reschedule state is persisted.
   */
  async alarm(): Promise<void> {
    const now = Date.now();
    const decision = await this.state.storage.transaction(async (transaction) => {
      const stored = await transaction.get<StoredRateLimitBucket>(BUCKET_KEY);
      if (!stored) return { action: "delete" } satisfies AlarmDecision;

      const resetAt = stored.window_start_ms + RATE_LIMIT_WINDOW_MS;
      if (resetAt > now) {
        return {
          action: "reschedule",
          reset_at_ms: resetAt,
        } satisfies AlarmDecision;
      }
      return { action: "delete" } satisfies AlarmDecision;
    });

    if (decision.action === "reschedule") {
      await this.state.storage.setAlarm(decision.reset_at_ms);
      return;
    }
    await this.state.storage.deleteAll();
  }
}
