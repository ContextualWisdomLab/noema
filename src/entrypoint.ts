import {
  ensureGlobalOutboundFetchPolicy,
} from "./outbound-fetch-policy";
import worker, {
  NoemaOidcReplayGuard,
  NoemaRateLimiter,
  type Env as WorkerEnv,
} from "./worker";

export { NoemaOidcReplayGuard, NoemaRateLimiter };
export interface Env extends WorkerEnv {}

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const trustedGithubApiBasePattern = /^https:\/\/api\.github\.com(?::443)?\/?$/;
const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const MAX_TRACE_LENGTH = 128;

type EgressFailure = {
  hint: string;
  outcome: "misconfigured" | "policy_unavailable";
  policy: "github-cloud-exact-origin" | "credential-fetch-no-redirect";
};

export function isTrustedGithubApiBase(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
    || !trustedGithubApiBasePattern.test(value)
  ) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return (
      parsed.origin === TRUSTED_GITHUB_API_ORIGIN
      && parsed.username === ""
      && parsed.password === ""
      && parsed.pathname === "/"
      && parsed.search === ""
      && parsed.hash === ""
    );
  } catch {
    return false;
  }
}

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

function githubApiConfigurationResponse(
  request: Request,
  failure: EgressFailure,
): Response {
  const traceId = traceIdFromRequest(request);
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_GITHUB_API",
    message: "GitHub API trust configuration unavailable",
    details: {
      hint: failure.hint,
      policy: failure.policy,
    },
    trace_id: traceId,
  }), {
    status: 503,
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

function recordConfigurationFailure(
  request: Request,
  failure: EgressFailure,
): void {
  try {
    console.log(JSON.stringify({
      event: "github_api_egress",
      route: "/exchange",
      method: request.method,
      status_code: 503,
      error_code: "ERR_GITHUB_API",
      outcome: failure.outcome,
      policy: failure.policy,
    }));
  } catch {
    // Logging must not convert a fail-closed configuration response into an exception.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exchange") {
      const originFailure: EgressFailure = {
        hint: "Configure GITHUB_API_BASE as the exact GitHub Cloud REST API origin.",
        outcome: "misconfigured",
        policy: "github-cloud-exact-origin",
      };
      if (!isTrustedGithubApiBase(env.GITHUB_API_BASE)) {
        recordConfigurationFailure(request, originFailure);
        return githubApiConfigurationResponse(request, originFailure);
      }

      const redirectFailure: EgressFailure = {
        hint: "Restore the global fail-closed fetch policy before exchanging credentials.",
        outcome: "policy_unavailable",
        policy: "credential-fetch-no-redirect",
      };
      if (!ensureGlobalOutboundFetchPolicy()) {
        recordConfigurationFailure(request, redirectFailure);
        return githubApiConfigurationResponse(request, redirectFailure);
      }

      return worker.fetch(request, {
        ...env,
        GITHUB_API_BASE: TRUSTED_GITHUB_API_ORIGIN,
      });
    }
    return worker.fetch(request, env);
  },
};
