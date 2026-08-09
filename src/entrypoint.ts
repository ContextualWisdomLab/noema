import {
  ensureGlobalOutboundFetchPolicy,
} from "./outbound-fetch-policy";
import worker, {
  NoemaOidcReplayGuard,
  NoemaRateLimiter,
  type Env as WorkerEnv,
} from "./worker";

export { NoemaOidcReplayGuard, NoemaRateLimiter };

/**
 * Runtime environment accepted by the outer Noema request boundary.
 * It inherits the worker's credential, replay, rate-limit, and GitHub API
 * bindings so callers can construct one complete deployment environment.
 */
export interface Env extends WorkerEnv {}

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const trustedGithubApiBasePattern = /^https:\/\/api\.github\.com(?::443)?\/?$/;
const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const jwtSegmentPattern = /^[A-Za-z0-9_-]+$/;
const MAX_TRACE_LENGTH = 128;
const MAX_AUTHORIZATION_HEADER_LENGTH = 16_384;
const MAX_JWT_HEADER_SEGMENT_LENGTH = 2_048;
const MAX_JWT_PAYLOAD_SEGMENT_LENGTH = 8_192;
const MAX_JWT_SIGNATURE_SEGMENT_LENGTH = 4_096;
const MAX_EXCHANGE_JSON_BODY_BYTES = 8_192;

type EgressFailure = {
  hint: string;
  outcome: "misconfigured" | "policy_unavailable";
  policy: "github-cloud-exact-origin" | "credential-fetch-no-redirect";
};

type ExchangeBodyFailure = {
  reason: "too_large" | "unreadable";
  status: 400 | 413;
};

/**
 * Result of applying the exchange endpoint's bounded request-body policy.
 * Successful results carry the rebuilt request; failure results carry only the
 * controlled reason and HTTP status that the outer boundary may expose.
 */
export type BoundedExchangeRequest =
  | { ok: true; request: Request }
  | { ok: false; failure: ExchangeBodyFailure };

/**
 * Checks whether a configured GitHub API base is exactly the trusted GitHub
 * Cloud REST origin, with no credentials, alternate path, query, or fragment.
 * @param value Untrusted configuration value to validate before credential-bearing egress.
 * @returns `true` only for the exact trusted HTTPS origin accepted by Noema.
 */
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

/**
 * Accepts only a compact, bounded JWT envelope before any decoding or credential
 * use. Missing and non-Bearer authorization values are delegated to the normal
 * API authentication path, while malformed Bearer envelopes fail at this edge.
 * @param value Raw Authorization header value, or `null` when the header is absent.
 * @returns Whether the value is safe to pass to the credential-bearing worker parser.
 */
export function isBoundedOidcBearer(value: string | null): boolean {
  if (value === null) return true;

  const match = value.match(/^Bearer\s+(\S+)$/i);
  if (!match) return true;
  if (value.length > MAX_AUTHORIZATION_HEADER_LENGTH) return false;

  const segments = match[1].split(".");
  if (segments.length !== 3) return false;

  const limits = [
    MAX_JWT_HEADER_SEGMENT_LENGTH,
    MAX_JWT_PAYLOAD_SEGMENT_LENGTH,
    MAX_JWT_SIGNATURE_SEGMENT_LENGTH,
  ];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) return false;
    if (segment.length > limits[index]) return false;
    if (!jwtSegmentPattern.test(segment)) return false;
  }

  return true;
}

/**
 * Consumes and rebuilds JSON POST bodies within the exchange API's fixed byte
 * budget. Streaming consumption prevents chunked input from bypassing a declared
 * Content-Length check and stops reading once the maximum is exceeded.
 * @param request Incoming request whose JSON body may need bounded streaming validation.
 * @returns The safe rebuilt request, or a controlled size/read failure for the caller.
 */
export async function boundExchangeJsonBody(request: Request): Promise<BoundedExchangeRequest> {
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (request.method !== "POST" || !contentType.includes("application/json")) {
    return { ok: true, request };
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_EXCHANGE_JSON_BODY_BYTES
  ) {
    return {
      ok: false,
      failure: { reason: "too_large", status: 413 },
    };
  }
  if (request.body === null) return { ok: true, request };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_EXCHANGE_JSON_BODY_BYTES) {
        try {
          await reader.cancel("Noema exchange JSON body exceeds byte limit");
        } catch {
          // Cancellation is best-effort after the request has already been rejected.
        }
        return {
          ok: false,
          failure: { reason: "too_large", status: 413 },
        };
      }
      chunks.push(value);
    }
  } catch {
    return {
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    };
  }

  const boundedBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    boundedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("content-length");
  return {
    ok: true,
    request: new Request(request.url, {
      method: request.method,
      headers,
      body: boundedBody,
      redirect: request.redirect,
      signal: request.signal,
    }),
  };
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

function oidcEnvelopeResponse(request: Request): Response {
  const traceId = traceIdFromRequest(request);
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_TOKEN_MALFORMED",
    message: "OIDC bearer token envelope is malformed or exceeds accepted bounds",
    details: {
      hint: "Request a fresh compact GitHub Actions OIDC JWT; oversized or non-base64url segments are rejected before decoding.",
      policy: "bounded-oidc-jwt-envelope",
      authorization_header_limit_bytes: String(MAX_AUTHORIZATION_HEADER_LENGTH),
      jwt_header_segment_limit_bytes: String(MAX_JWT_HEADER_SEGMENT_LENGTH),
      jwt_payload_segment_limit_bytes: String(MAX_JWT_PAYLOAD_SEGMENT_LENGTH),
      jwt_signature_segment_limit_bytes: String(MAX_JWT_SIGNATURE_SEGMENT_LENGTH),
    },
    trace_id: traceId,
  }), {
    status: 400,
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

function exchangeBodyResponse(request: Request, failure: ExchangeBodyFailure): Response {
  const traceId = traceIdFromRequest(request);
  const tooLarge = failure.reason === "too_large";
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_VALIDATION_INPUT",
    message: tooLarge
      ? "Exchange JSON body exceeds accepted bounds"
      : "Exchange JSON body could not be read",
    details: {
      hint: tooLarge
        ? "Send only the target_repository JSON field within the documented byte limit."
        : "Retry with a complete application/json request body.",
      policy: "bounded-exchange-json-body",
      body_limit_bytes: String(MAX_EXCHANGE_JSON_BODY_BYTES),
      reason: failure.reason,
    },
    trace_id: traceId,
  }), {
    status: failure.status,
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

function recordOidcEnvelopeFailure(request: Request): void {
  try {
    console.log(JSON.stringify({
      event: "oidc_token_envelope",
      route: "/exchange",
      method: request.method,
      status_code: 400,
      error_code: "ERR_TOKEN_MALFORMED",
      outcome: "rejected",
      policy: "bounded-oidc-jwt-envelope",
    }));
  } catch {
    // Logging must not convert a fail-closed input response into an exception.
  }
}

function recordExchangeBodyFailure(request: Request, failure: ExchangeBodyFailure): void {
  try {
    console.log(JSON.stringify({
      event: "exchange_json_body",
      route: "/exchange",
      method: request.method,
      status_code: failure.status,
      error_code: "ERR_VALIDATION_INPUT",
      outcome: "rejected",
      policy: "bounded-exchange-json-body",
      reason: failure.reason,
      body_limit_bytes: MAX_EXCHANGE_JSON_BODY_BYTES,
    }));
  } catch {
    // Logging must not convert a fail-closed input response into an exception.
  }
}

/**
 * Cloudflare Worker entrypoint that applies the outer `/exchange` input and
 * credential-egress boundaries before delegating to the core worker. Any missing
 * trust configuration or bounded-input failure returns a controlled fail-closed response.
 */
export default {
  /**
   * Routes an incoming request through edge validation and then the core Worker.
   * @param request Incoming Cloudflare Worker request.
   * @param env Complete runtime bindings required by Noema.
   * @returns The fail-closed edge response or the delegated core Worker response.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exchange") {
      if (!isBoundedOidcBearer(request.headers.get("authorization"))) {
        recordOidcEnvelopeFailure(request);
        return oidcEnvelopeResponse(request);
      }

      const boundedRequest = await boundExchangeJsonBody(request);
      if ("failure" in boundedRequest) {
        recordExchangeBodyFailure(request, boundedRequest.failure);
        return exchangeBodyResponse(request, boundedRequest.failure);
      }
      request = boundedRequest.request;

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
