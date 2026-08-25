import baseWorker, { type Env as BaseEnv } from "./index";
import {
  claimOidcTokenUsage,
  NoemaOidcReplayGuard,
  OidcReplayDetected,
  OidcReplayUnavailable,
  type OidcReplayProtectionEnv,
} from "./oidc-replay";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  NoemaRateLimiter,
  type DistributedRateLimitDecision,
  type DistributedRateLimitEnv,
} from "./rate-limit";

export { NoemaOidcReplayGuard, NoemaRateLimiter };

/**
 * Runtime configuration for the protected Worker layer. It composes the base GitHub
 * credential-exchange environment with distributed rate-limit and OIDC replay bindings
 * so every credential-bearing exchange can fail closed when shared controls are unavailable.
 */
export interface Env extends BaseEnv, DistributedRateLimitEnv, OidcReplayProtectionEnv {}

const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const trustedJtiPattern = /^[A-Za-z0-9._:-]+$/;
const trustedOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const canonicalCommitRefPattern = /^[0-9a-f]{40}$/;
const anyCaseCommitRefPattern = /^[0-9A-Fa-f]{40}$/;
const trustedNamedRefPattern = /^refs\/(?:heads|tags)\/(?=.{1,1024}$)(?!\.)(?![^/]*\.lock(?:\/|$))(?!.*\/\.)(?!.*\/[^/]*\.lock(?:\/|$))(?!.*(?:\.\.|\/\/|@\{|\\|[\x00-\x20\x7f~^:?*\[]))(?!.*[\/.]$)[A-Za-z0-9._/-]+$/;
const MAX_TRACE_LENGTH = 128;
const MAX_JTI_LENGTH = 256;
const MAX_OIDC_PAYLOAD_SEGMENT_LENGTH = 8_192;

type OidcWorkflowClaims = {
  workflow_ref?: unknown;
  job_workflow_ref?: unknown;
  jti?: unknown;
  exp?: unknown;
};

type WorkflowTrustDecision =
  | { allowed: true }
  | {
    allowed: false;
    status: 403 | 503;
    message: string;
    hint: string;
    outcome: "blocked" | "misconfigured";
  };

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

function decodeOidcWorkflowClaims(request: Request): OidcWorkflowClaims | undefined {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
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
    return decoded as OidcWorkflowClaims;
  } catch {
    return undefined;
  }
}

function isTrustedWorkflowRepository(value: string, owner: string): boolean {
  if (!trustedOwnerPattern.test(owner)) return false;
  const prefix = `${owner}/`;
  if (!value.startsWith(prefix)) return false;
  const repositoryName = value.slice(prefix.length);
  return repositoryName !== "."
    && repositoryName !== ".."
    && /^[A-Za-z0-9_.-]{1,100}$/.test(repositoryName);
}

function configuredExactWorkflowRef(env: Env): string | undefined {
  if (!isTrustedWorkflowRepository(env.ALLOWED_WORKFLOW_REPOSITORY, env.ALLOWED_REPOSITORY_OWNER)) {
    return undefined;
  }
  const candidate = env.ALLOWED_WORKFLOW_REF_PREFIX;
  const repositoryPrefix = `${env.ALLOWED_WORKFLOW_REPOSITORY}/.github/workflows/`;
  if (!candidate || !candidate.startsWith(repositoryPrefix)) return undefined;

  const workflowAndRef = candidate.slice(repositoryPrefix.length);
  const separatorIndex = workflowAndRef.indexOf("@");
  const workflowFile = separatorIndex >= 0
    ? workflowAndRef.slice(0, separatorIndex)
    : "";
  const refName = separatorIndex >= 0
    ? workflowAndRef.slice(separatorIndex + 1)
    : "";
  if (
    separatorIndex <= 0
    || separatorIndex !== workflowAndRef.lastIndexOf("@")
    || separatorIndex === workflowAndRef.length - 1
    || !/^[A-Za-z0-9_.-]{1,100}\.ya?ml$/.test(workflowFile)
    || /[\s*?,]/.test(candidate)
    || (anyCaseCommitRefPattern.test(refName) && !canonicalCommitRefPattern.test(refName))
    || (!canonicalCommitRefPattern.test(refName) && !trustedNamedRefPattern.test(refName))
  ) {
    return undefined;
  }
  return candidate;
}

function exactWorkflowTrustDecision(
  claims: OidcWorkflowClaims | undefined,
  env: Env,
): WorkflowTrustDecision {
  const configuredRef = configuredExactWorkflowRef(env);
  if (!configuredRef) {
    return {
      allowed: false,
      status: 503,
      message: "Workflow trust configuration unavailable",
      hint: "Configure one concrete reusable workflow file at one exact branch, tag, or commit ref.",
      outcome: "misconfigured",
    };
  }

  if (!claims) return { allowed: true };
  const workflowRef = typeof claims.job_workflow_ref === "string"
    ? claims.job_workflow_ref
    : typeof claims.workflow_ref === "string"
      ? claims.workflow_ref
      : undefined;
  if (!workflowRef) return { allowed: true };
  if (workflowRef !== configuredRef) {
    return {
      allowed: false,
      status: 403,
      message: "OIDC workflow_ref is not allowed",
      hint: "Run the request from the exact configured central workflow ref; prefix-sharing refs are rejected.",
      outcome: "blocked",
    };
  }
  return { allowed: true };
}

function replayClaims(
  claims: OidcWorkflowClaims | undefined,
): { jti: string; exp: number } | undefined {
  if (
    !claims
    || typeof claims.jti !== "string"
    || claims.jti.length === 0
    || claims.jti.length > MAX_JTI_LENGTH
    || !trustedJtiPattern.test(claims.jti)
    || typeof claims.exp !== "number"
    || !Number.isInteger(claims.exp)
  ) {
    return undefined;
  }
  return { jti: claims.jti, exp: claims.exp };
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

function workflowTrustResponse(
  request: Request,
  decision: Exclude<WorkflowTrustDecision, { allowed: true }>,
): Response {
  const traceId = traceIdFromRequest(request);
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_WORKFLOW_NOT_ALLOWED",
    message: decision.message,
    details: {
      hint: decision.hint,
      match_policy: "exact",
    },
    trace_id: traceId,
  }), {
    status: decision.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
      "x-trace-id": traceId,
      "x-latency-ms": "0",
    },
  });
}

function oidcReplayResponse(
  request: Request,
  status: 401 | 503,
  message: string,
  hint: string,
): Response {
  const traceId = traceIdFromRequest(request);
  const headers = new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "pragma": "no-cache",
    "x-content-type-options": "nosniff",
    "x-trace-id": traceId,
    "x-latency-ms": "0",
    "x-oidc-replay-protection": "distributed",
  });
  if (status === 401) {
    headers.set("www-authenticate", "Bearer realm=\"noema\", error=\"invalid_token\"");
  }
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_AUTH_REPLAY",
    message,
    details: {
      hint,
      replay_protection: "distributed-single-use",
    },
    trace_id: traceId,
  }), { status, headers });
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

/**
 * Protected public Worker entrypoint layered over the base exchange worker. It applies
 * distributed rate limiting, exact reusable-workflow trust, and single-use OIDC replay
 * semantics before returning any successful credential exchange with security headers.
 */
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

    const claims = decodeOidcWorkflowClaims(request);
    const workflowTrust = exactWorkflowTrustDecision(claims, env);
    if (!workflowTrust.allowed) {
      console.log(JSON.stringify({
        event: "workflow_trust",
        route: url.pathname,
        method: request.method,
        status_code: workflowTrust.status,
        error_code: "ERR_WORKFLOW_NOT_ALLOWED",
        outcome: workflowTrust.outcome,
        match_policy: "exact",
      }));
      return withDistributedRateLimitHeaders(
        workflowTrustResponse(request, workflowTrust),
        decision,
      );
    }

    if (claims && !env.NOEMA_OIDC_REPLAY_GUARD) {
      console.log(JSON.stringify({
        event: "oidc_replay_protection",
        route: url.pathname,
        method: request.method,
        status_code: 503,
        error_code: "ERR_AUTH_REPLAY",
        outcome: "binding_unavailable",
      }));
      return withDistributedRateLimitHeaders(
        oidcReplayResponse(
          request,
          503,
          "OIDC replay protection unavailable",
          "Configure the distributed replay guard before credential-bearing exchange is enabled.",
        ),
        decision,
      );
    }

    const response = await baseWorker.fetch(request, env);
    if (response.status < 200 || response.status >= 300) {
      return withDistributedRateLimitHeaders(response, decision);
    }

    if (response.headers.get("x-oidc-replay-protection") === "verified-before-mint") {
      const headers = new Headers(response.headers);
      headers.set("x-oidc-replay-protection", "single-use");
      return withDistributedRateLimitHeaders(new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      }), decision);
    }

    const replay = replayClaims(claims);
    if (!replay) {
      console.log(JSON.stringify({
        event: "oidc_replay_protection",
        route: url.pathname,
        method: request.method,
        status_code: 503,
        error_code: "ERR_AUTH_REPLAY",
        outcome: "claims_unavailable",
      }));
      return withDistributedRateLimitHeaders(
        oidcReplayResponse(
          request,
          503,
          "OIDC replay protection claims unavailable",
          "Request a fresh GitHub Actions OIDC token containing bounded jti and exp claims.",
        ),
        decision,
      );
    }

    try {
      await claimOidcTokenUsage(replay.jti, replay.exp, env);
    } catch (error) {
      if (error instanceof OidcReplayDetected) {
        console.log(JSON.stringify({
          event: "oidc_replay_protection",
          route: url.pathname,
          method: request.method,
          status_code: 401,
          error_code: "ERR_AUTH_REPLAY",
          outcome: "replayed",
          expires_at_epoch_seconds: error.expiresAtEpochSeconds,
        }));
        return withDistributedRateLimitHeaders(
          oidcReplayResponse(
            request,
            401,
            "OIDC token has already been exchanged",
            "Request a new GitHub Actions OIDC token; each jti is accepted exactly once.",
          ),
          decision,
        );
      }

      const detail = error instanceof OidcReplayUnavailable
        ? error.message
        : "unexpected OIDC replay-guard failure";
      console.log(JSON.stringify({
        event: "oidc_replay_protection",
        route: url.pathname,
        method: request.method,
        status_code: 503,
        error_code: "ERR_AUTH_REPLAY",
        outcome: "unavailable",
        detail: detail.slice(0, 256),
      }));
      return withDistributedRateLimitHeaders(
        oidcReplayResponse(
          request,
          503,
          "OIDC replay protection unavailable",
          "Retry only after the distributed replay guard is healthy; token delivery fails closed.",
        ),
        decision,
      );
    }

    const headers = new Headers(response.headers);
    headers.set("x-oidc-replay-protection", "single-use");
    return withDistributedRateLimitHeaders(new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    }), decision);
  },
};
