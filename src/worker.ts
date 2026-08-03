import baseWorker, { type Env as BaseEnv } from "./index";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  NoemaRateLimiter,
  type DistributedRateLimitDecision,
  type DistributedRateLimitEnv,
} from "./rate-limit";

export { NoemaRateLimiter };

export interface Env extends BaseEnv, DistributedRateLimitEnv {}

const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const MAX_TRACE_LENGTH = 128;

function traceIdFromRequest(request: Request): string {
  for (const header of ["x-request-id", "x-correlation-id"]) {
    const candidate = request.headers.get(header)?.trim();
    if (
      candidate
      && candidate.length <= MAX_TRACE_LENGTH
      && trustedTracePattern.test(candidate)
    ) {
      return candidate;
    }
  }
  return crypto.randomUUID();
}

function distributedRateLimitResponse(
  request: Request,
  status: 429 | 503,
  message: string,
  retryAfterSeconds: number,
  limit?: number,
): Response {
  const traceId = traceIdFromRequest(request);
  const body = {
    ok: false,
    error_code: "ERR_RATE_LIMIT",
    message,
    details: {
      hint: status === 429
        ? "Back off and retry after the distributed rate-limit window resets."
        : "Retry after the distributed rate-limit service is available.",
      retry_after_seconds: String(retryAfterSeconds),
      scope: "distributed",
    },
    trace_id: traceId,
  };
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "x-trace-id": traceId,
    "x-latency-ms": "0",
    "retry-after": String(retryAfterSeconds),
    "x-rate-limit-scope": "distributed",
  });
  if (limit !== undefined) {
    headers.set("x-rate-limit-limit", String(limit));
    headers.set("x-rate-limit-remaining", "0");
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function withDistributedRateLimitHeaders(
  response: Response,
  decision: DistributedRateLimitDecision,
): Response {
  const headers = new Headers(response.headers);
  headers.set("x-rate-limit-limit", String(decision.limit));
  headers.set("x-rate-limit-remaining", String(decision.remaining));
  headers.set("x-rate-limit-scope", "distributed");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/exchange") {
      return baseWorker.fetch(request, env);
    }

    let decision: DistributedRateLimitDecision;
    try {
      decision = await checkDistributedRateLimit(request, env);
    } catch (error) {
      const detail = error instanceof DistributedRateLimitUnavailable
        ? error.message
        : "unexpected distributed rate-limit failure";
      console.log(JSON.stringify({
        event: "distributed_rate_limit",
        route: url.pathname,
        method: request.method,
        status_code: 503,
        error_code: "ERR_RATE_LIMIT",
        outcome: "unavailable",
        detail: detail.slice(0, 256),
      }));
      return distributedRateLimitResponse(
        request,
        503,
        "Distributed rate limiter unavailable",
        1,
      );
    }

    if (!decision.allowed) {
      console.log(JSON.stringify({
        event: "distributed_rate_limit",
        route: url.pathname,
        method: request.method,
        status_code: 429,
        error_code: "ERR_RATE_LIMIT",
        outcome: "blocked",
        limit: decision.limit,
        retry_after_seconds: decision.retry_after_seconds,
      }));
      return distributedRateLimitResponse(
        request,
        429,
        "Rate limit exceeded",
        decision.retry_after_seconds,
        decision.limit,
      );
    }

    const response = await baseWorker.fetch(request, env);
    return withDistributedRateLimitHeaders(response, decision);
  },
};
