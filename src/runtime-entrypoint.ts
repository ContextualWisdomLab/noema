import entrypoint, {
  NoemaOidcReplayGuard,
  NoemaRateLimiter,
  type Env as BaseEnv,
} from "./entrypoint";
import { normalizeGitHubAppPrivateKeyPem } from "./github-app-private-key";
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

interface RuntimeCredentialEnvCacheEntry {
  sourcePrivateKey: string | undefined;
  normalizedPrivateKey: string;
  runtimeEnv: Env;
}

const runtimeCredentialEnvCache = new WeakMap<Env, RuntimeCredentialEnvCacheEntry>();

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

function synchronizeRuntimeCredentialEnv(
  runtimeEnv: Env,
  env: Env,
  normalizedPrivateKey: string,
): void {
  for (const key of Object.keys(runtimeEnv)) {
    if (
      key !== "GITHUB_APP_PRIVATE_KEY_PEM"
      && !Object.prototype.hasOwnProperty.call(env, key)
    ) {
      delete (runtimeEnv as unknown as Record<string, unknown>)[key];
    }
  }
  Object.assign(runtimeEnv, env);
  runtimeEnv.GITHUB_APP_PRIVATE_KEY_PEM = normalizedPrivateKey;
}

function runtimeCredentialEnv(env: Env): Env {
  const sourcePrivateKey = env.GITHUB_APP_PRIVATE_KEY_PEM;
  const normalizedPrivateKey = normalizeGitHubAppPrivateKeyPem(sourcePrivateKey);
  if (
    normalizedPrivateKey === undefined
    || normalizedPrivateKey === sourcePrivateKey
  ) {
    return env;
  }

  const cached = runtimeCredentialEnvCache.get(env);
  if (
    cached
    && cached.sourcePrivateKey === sourcePrivateKey
    && cached.normalizedPrivateKey === normalizedPrivateKey
  ) {
    synchronizeRuntimeCredentialEnv(cached.runtimeEnv, env, normalizedPrivateKey);
    return cached.runtimeEnv;
  }

  const runtimeEnv = {
    ...env,
    GITHUB_APP_PRIVATE_KEY_PEM: normalizedPrivateKey,
  };
  runtimeCredentialEnvCache.set(env, {
    sourcePrivateKey,
    normalizedPrivateKey,
    runtimeEnv,
  });
  return runtimeEnv;
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
 * credential-bearing request to the hardened exchange entrypoint. GitHub App generated
 * PKCS#1 RSA private keys are converted to the PKCS#8 envelope required by WebCrypto at
 * this outer runtime boundary before readiness or exchange code receives the secret.
 * Non-canonical external trace headers are removed before delegation rather than normalized
 * into trusted evidence; canonical trace headers remain request-correlation authority for
 * readiness responses. The delegated layers own bounded request handling, distributed rate
 * limiting, exact reusable-workflow policy, replay protection, and authoritative
 * cryptographic JWT/workflow-source verification before minting.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const boundedRequest = canonicalTraceRequest(request);
    const runtimeEnv = runtimeCredentialEnv(env);
    const url = new URL(boundedRequest.url);
    if (url.pathname === "/ready") {
      return runtimeReadinessResponse(boundedRequest, runtimeEnv);
    }
    return entrypoint.fetch(boundedRequest, runtimeEnv);
  },
};
