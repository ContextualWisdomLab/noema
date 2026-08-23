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

const exactCommitShaPattern = /^[0-9a-f]{40}$/;
const MAX_OIDC_PAYLOAD_SEGMENT_LENGTH = 8_192;

type ReusableWorkflowClaims = {
  workflow_ref?: unknown;
  workflow_sha?: unknown;
  job_workflow_ref?: unknown;
  job_workflow_sha?: unknown;
};

type WorkflowSourceDecision =
  | { allowed: true }
  | {
    allowed: false;
    status: 403 | 503;
    message: string;
    hint: string;
    outcome: "blocked" | "misconfigured";
  };

function decodedReusableWorkflowClaims(request: Request): ReusableWorkflowClaims | undefined {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (!match) return undefined;

  const parts = match[1].split(".");
  if (parts.length !== 3 || parts[1].length > MAX_OIDC_PAYLOAD_SEGMENT_LENGTH) {
    return undefined;
  }

  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    const decoded: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      return undefined;
    }
    return decoded as ReusableWorkflowClaims;
  } catch {
    return undefined;
  }
}

function workflowSourceDecision(request: Request, env: Env): WorkflowSourceDecision {
  const claims = decodedReusableWorkflowClaims(request);
  if (!claims) return { allowed: true };

  const usingReusableWorkflowIdentity = typeof claims.job_workflow_ref === "string";
  const workflowRef = usingReusableWorkflowIdentity
    ? claims.job_workflow_ref
    : typeof claims.workflow_ref === "string"
      ? claims.workflow_ref
      : undefined;
  if (!workflowRef) return { allowed: true };

  const configuredRef = env.ALLOWED_WORKFLOW_REF_PREFIX?.trim();
  if (!configuredRef || workflowRef !== configuredRef) {
    // The delegated hardened worker owns the exact workflow-ref error contract.
    return { allowed: true };
  }

  const configuredSha = env.ALLOWED_WORKFLOW_SHA;
  if (!configuredSha || !exactCommitShaPattern.test(configuredSha)) {
    return {
      allowed: false,
      status: 503,
      message: "Workflow source trust configuration unavailable",
      hint: "Configure the exact 40-character lowercase commit SHA for the allowed workflow source.",
      outcome: "misconfigured",
    };
  }

  const workflowSha = usingReusableWorkflowIdentity
    ? claims.job_workflow_sha
    : claims.workflow_sha;
  if (workflowSha !== configuredSha) {
    return {
      allowed: false,
      status: 403,
      message: "OIDC workflow source revision is not allowed",
      hint: "Run the request from the configured workflow source revision; mutable-ref identity alone is insufficient.",
      outcome: "blocked",
    };
  }

  return { allowed: true };
}

function workflowSourceResponse(
  decision: Exclude<WorkflowSourceDecision, { allowed: true }>,
): Response {
  const traceId = crypto.randomUUID();
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_WORKFLOW_NOT_ALLOWED",
    message: decision.message,
    details: {
      hint: decision.hint,
      match_policy: "exact-ref-and-source-sha",
    },
    trace_id: traceId,
  }), {
    status: decision.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-trace-id": traceId,
      "x-latency-ms": "0",
    },
  });
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
 * Routes `/ready` probes through configuration readiness checks, rejects a configured workflow
 * source revision that does not match the immutable SHA associated with its OIDC workflow
 * identity, and delegates every remaining request to the hardened credential-exchange
 * entrypoint. The delegated worker still performs the authoritative cryptographic JWT
 * verification before any credential mint.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/ready") {
      return runtimeReadinessResponse(request, env);
    }
    if (url.pathname === "/exchange") {
      const sourceDecision = workflowSourceDecision(request, env);
      if (!sourceDecision.allowed) {
        console.log(JSON.stringify({
          event: "workflow_source_trust",
          route: url.pathname,
          method: request.method,
          status_code: sourceDecision.status,
          error_code: "ERR_WORKFLOW_NOT_ALLOWED",
          outcome: sourceDecision.outcome,
          match_policy: "exact-ref-and-source-sha",
        }));
        return workflowSourceResponse(sourceDecision);
      }
    }
    return entrypoint.fetch(request, env);
  },
};
