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
 * consumed by the delegated application entrypoint and adds the immutable source revision
 * expected for the configured central reusable workflow.
 */
export interface Env extends BaseEnv {
  ALLOWED_WORKFLOW_SHA?: string;
}

const canonicalTraceHeaderPattern = /^[A-Za-z0-9._:-]+$/;
const maxTraceHeaderLength = 128;
const traceHeaderNames = ["x-request-id", "x-correlation-id"] as const;

function canonicalTraceRequest(request: Request): Request {
  let headers: Headers | undefined;
  for (const name of traceHeaderNames) {
    const value = request.headers.get(name);
    if (
      value === null
      || (value.length <= maxTraceHeaderLength && canonicalTraceHeaderPattern.test(value))
    ) {
      continue;
    }
    headers ??= new Headers(request.headers);
    headers.delete(name);
  }
  return headers === undefined ? request : new Request(request, { headers });
}

function traceIdFromRequest(request: Request): string {
  for (const name of traceHeaderNames) {
    const value = request.headers.get(name);
    if (
      value !== null
      && value.length <= maxTraceHeaderLength
      && canonicalTraceHeaderPattern.test(value)
    ) {
      return value;
    }
  }
  return crypto.randomUUID();
}

function credentialFetchCapabilityAvailable(): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch");
  return descriptor !== undefined
    && "value" in descriptor
    && descriptor.writable === true
    && typeof descriptor.value === "function";
}

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
  const traceId = traceIdFromRequest(request);
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
  const credentialFetchCapable = credentialFetchCapabilityAvailable();
  const failedChecks = credentialFetchCapable
    ? result.failedChecks
    : [...result.failedChecks, "credential_fetch_capability"];
  const ready = result.ready && credentialFetchCapable;
  const latencyMs = Math.round(performance.now() - startedAt);
  const headers = readinessHeaders(
    traceId,
    latencyMs,
    ready ? "ready" : "not-ready",
  );
  const body = ready
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
          failed_checks: failedChecks.join(","),
        },
        trace_id: traceId,
      };

  return new Response(
    request.method === "HEAD" ? null : JSON.stringify(body),
    {
      status: ready ? 200 : 503,
      headers,
    },
  );
}

/**
 * Cloudflare Worker entrypoint for Noema's public runtime surface.
 * Routes `/ready` probes through configuration readiness checks and delegates every
 * credential-bearing request to the hardened exchange entrypoint. Non-canonical external
 * trace headers are removed before delegation rather than normalized into trusted evidence;
 * canonical trace headers remain request-correlation authority for readiness responses.
 * The delegated layers own bounded request handling, distributed rate limiting, exact
 * reusable-workflow policy, replay protection, and authoritative cryptographic
 * JWT/workflow-source verification before minting.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const boundedRequest = canonicalTraceRequest(request);
    const url = new URL(boundedRequest.url);
    if (url.pathname === "/ready") {
      return runtimeReadinessResponse(boundedRequest, env);
    }
    return entrypoint.fetch(boundedRequest, env);
  },
};
