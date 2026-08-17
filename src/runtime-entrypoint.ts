import entrypoint, {
  NoemaOidcReplayGuard,
  NoemaRateLimiter,
  type Env as BaseEnv,
} from "./entrypoint";
import { evaluateRuntimeReadiness } from "./runtime-readiness";

export { NoemaOidcReplayGuard, NoemaRateLimiter };

/**
 * Runtime bindings required by Noema's production worker entrypoint.
 * This interface inherits the credential-exchange, replay-guard, and rate-limit bindings
 * consumed by the delegated application entrypoint and the readiness evaluation path.
 */
export interface Env extends BaseEnv {}

function readinessHeaders(
  traceId: string,
  latencyMs: number,
  state?: "ready" | "not-ready",
): Headers {
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    pragma: "no-cache",
    "x-content-type-options": "nosniff",
    "x-trace-id": traceId,
    "x-latency-ms": String(latencyMs),
  });
  if (state !== undefined) headers.set("x-noema-readiness", state);
  if (state === "not-ready") headers.set("retry-after", "30");
  return headers;
}

async function runtimeReadinessResponse(request: Request, env: Env): Promise<Response> {
  const startedAt = performance.now();
  const traceId = crypto.randomUUID();
  if (request.method !== "GET" && request.method !== "HEAD") {
    const headers = readinessHeaders(
      traceId,
      Math.round(performance.now() - startedAt),
    );
    headers.set("allow", "GET, HEAD");
    return new Response(JSON.stringify({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Method not allowed",
      details: {
        hint: "Use GET or HEAD for runtime readiness probes.",
        allowed_methods: "GET, HEAD",
      },
      trace_id: traceId,
    }), { status: 405, headers });
  }

  const result = await evaluateRuntimeReadiness(env);
  const latencyMs = Math.round(performance.now() - startedAt);
  const headers = readinessHeaders(
    traceId,
    latencyMs,
    result.ready ? "ready" : "not-ready",
  );
  const body = result.ready
    ? {
        ok: true,
        data: {
          name: "noema",
          status: "ready",
          checks: { configuration: "pass" },
        },
        trace_id: traceId,
      }
    : {
        ok: false,
        error_code: "ERR_SERVICE_NOT_READY",
        message: "Noema credential exchange is not ready",
        details: {
          hint: "Repair the listed configuration checks before routing credential-exchange traffic.",
          failed_checks: result.failedChecks.join(","),
        },
        trace_id: traceId,
      };

  return new Response(
    request.method === "HEAD" ? null : JSON.stringify(body),
    {
      status: result.ready ? 200 : 503,
      headers,
    },
  );
}

/**
 * Cloudflare Worker entrypoint for Noema's public runtime surface.
 * Routes `/ready` probes through configuration readiness checks and delegates every other
 * request to the hardened credential-exchange entrypoint without altering its response.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ready") {
      return runtimeReadinessResponse(request, env);
    }
    return entrypoint.fetch(request, env);
  },
};
