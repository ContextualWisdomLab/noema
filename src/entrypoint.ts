import worker, {
  NoemaOidcReplayGuard,
  NoemaRateLimiter,
  type Env as WorkerEnv,
} from "./worker";

export { NoemaOidcReplayGuard, NoemaRateLimiter };
export interface Env extends WorkerEnv {}

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const MAX_TRACE_LENGTH = 128;

export function isTrustedGithubApiBase(value: unknown): value is string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value !== value.trim()
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

function githubApiConfigurationResponse(request: Request): Response {
  const traceId = traceIdFromRequest(request);
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_GITHUB_API",
    message: "GitHub API trust configuration unavailable",
    details: {
      hint: "Configure GITHUB_API_BASE as the exact GitHub Cloud REST API origin.",
      policy: "github-cloud-exact-origin",
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

function recordConfigurationFailure(request: Request): void {
  try {
    console.log(JSON.stringify({
      event: "github_api_egress",
      route: "/exchange",
      method: request.method,
      status_code: 503,
      error_code: "ERR_GITHUB_API",
      outcome: "misconfigured",
      policy: "github-cloud-exact-origin",
    }));
  } catch {
    // Logging must not convert a fail-closed configuration response into an exception.
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exchange") {
      if (!isTrustedGithubApiBase(env.GITHUB_API_BASE)) {
        recordConfigurationFailure(request);
        return githubApiConfigurationResponse(request);
      }
      return worker.fetch(request, {
        ...env,
        GITHUB_API_BASE: TRUSTED_GITHUB_API_ORIGIN,
      });
    }
    return worker.fetch(request, env);
  },
};
