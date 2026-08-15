const RATE_LIMIT_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;
const MAX_RATE_LIMIT_PER_MINUTE = 10_000;
const MAX_CLIENT_IDENTIFIER_LENGTH = 128;
const MAX_RATE_LIMIT_DECISION_BYTES = 4_096;
const strictIpv4SegmentPattern = /^(0|[1-9][0-9]{0,2})$/;
const strictIpv6CharacterPattern = /^[0-9A-Fa-f:.]+$/;
const BUCKET_KEY = "exchange-rate-limit";
const rateLimitDecisionKeys = new Set([
  "allowed",
  "limit",
  "remaining",
  "retry_after_seconds",
]);

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

type AlarmDecision =
  | { action: "delete" }
  | { action: "reschedule"; reset_at_ms: number };

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

export function isJsonMediaType(raw: string | null): boolean {
  const mediaType = (raw ?? "").split(";", 1)[0]!.trim().toLowerCase();
  return mediaType === "application/json";
}

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

function hasDuplicateRateLimitDecisionKey(text: string): boolean {
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
        if (!rateLimitDecisionKeys.has(decodedKey)) continue;
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

async function readBoundedRateLimitDecision(response: Response): Promise<unknown> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_RATE_LIMIT_DECISION_BYTES
  ) {
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
        try {
          await reader.cancel("Noema rate-limit decision exceeds byte limit");
        } catch {
          // Cancellation is best-effort after the response has already been rejected.
        }
        throw new DistributedRateLimitUnavailable(
          "rate-limit Durable Object decision exceeds the response byte limit",
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof DistributedRateLimitUnavailable) throw error;
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
  if (hasDuplicateRateLimitDecisionKey(text)) {
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
    if (response.status !== 200) {
      throw new DistributedRateLimitUnavailable(
        `rate-limit Durable Object returned HTTP ${response.status}`,
      );
    }
    if (!isJsonMediaType(response.headers.get("content-type"))) {
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
    if (!isJsonMediaType(request.headers.get("content-type"))) {
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
