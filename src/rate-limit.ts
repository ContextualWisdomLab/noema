const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const MAX_RATE_LIMIT_PER_MINUTE = 10_000;
const MAX_CLIENT_IDENTIFIER_LENGTH = 128;
const trustedClientIdentifierPattern = /^[A-Za-z0-9.:%_,-]+$/;
const BUCKET_KEY = "exchange-rate-limit";

export interface DistributedRateLimitEnv {
  NOEMA_RATE_LIMIT_PER_MINUTE?: string;
  NOEMA_RATE_LIMITER: DurableObjectNamespace;
}

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

export function configuredDistributedRateLimit(raw: string | undefined): number {
  const parsed = Number(raw ?? String(DEFAULT_RATE_LIMIT_PER_MINUTE));
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  return Math.min(Math.floor(parsed), MAX_RATE_LIMIT_PER_MINUTE);
}

export function trustedClientIdentifier(request: Request): string {
  const candidate = request.headers.get("cf-connecting-ip")?.trim() ?? "";
  if (
    !candidate
    || candidate.length > MAX_CLIENT_IDENTIFIER_LENGTH
    || !trustedClientIdentifierPattern.test(candidate)
  ) {
    return "unknown";
  }
  return candidate;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function distributedRateLimitObjectName(request: Request): Promise<string> {
  const identifier = trustedClientIdentifier(request);
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

export class NoemaRateLimiter {
  constructor(private readonly state: DurableObjectState) {}

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

  async alarm(): Promise<void> {
    await this.state.storage.deleteAll();
  }
}
