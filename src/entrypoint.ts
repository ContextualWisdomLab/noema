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
 * Runtime configuration accepted by the public request-edge worker. It inherits the
 * credential, replay-protection, rate-limit, and workflow-trust settings required by
 * the protected worker while keeping this entrypoint's outbound GitHub API checks explicit.
 */
export interface Env extends WorkerEnv {}

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const trustedGithubApiBasePattern = /^https:\/\/api\.github\.com(?::443)?\/?$/;
const trustedTracePattern = /^[A-Za-z0-9._:-]+$/;
const jwtSegmentPattern = /^[A-Za-z0-9_-]+$/;
const positiveDecimalPattern = /^[1-9][0-9]*$/;
const MAX_TRACE_LENGTH = 128;
const MAX_AUTHORIZATION_HEADER_LENGTH = 16_384;
const MAX_JWT_HEADER_SEGMENT_LENGTH = 2_048;
const MAX_JWT_PAYLOAD_SEGMENT_LENGTH = 8_192;
const MAX_JWT_SIGNATURE_SEGMENT_LENGTH = 4_096;
const MAX_EXCHANGE_JSON_BODY_BYTES = 8_192;

type EgressFailure = {
  hint: string;
  outcome: "misconfigured" | "policy_unavailable";
  policy:
    | "github-cloud-exact-origin"
    | "github-app-id-canonical"
    | "github-app-installation-id-canonical"
    | "credential-fetch-no-redirect";
};

type ExchangeBodyFailure = {
  reason: "too_large" | "unreadable" | "duplicate_keys" | "invalid_shape" | "unsupported_media_type";
  status: 400 | 413 | 415;
};

/**
 * Result of bounding an exchange request body at the public request edge. Successful
 * results preserve the original Request when no POST body needs bounding, while POST
 * requests with bodies carry the rebuilt bounded Request. Failures carry only the reviewed
 * reason and HTTP status needed to produce a fail-closed response without exposing body bytes.
 */
export type BoundedExchangeRequest =
  | { ok: true; request: Request }
  | { ok: false; failure: ExchangeBodyFailure };

/**
 * Validate that a configured GitHub API base is exactly the trusted GitHub Cloud REST
 * origin, with no credentials, path, query, or fragment that could redirect secrets.
 * @param value Candidate runtime configuration value to validate.
 * @returns True only when the value is the exact accepted GitHub API base origin.
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

function isCanonicalPositiveSafeInteger(value: string): boolean {
  if (!positiveDecimalPattern.test(value)) return false;
  const numericValue = Number(value);
  return Number.isSafeInteger(numericValue) && String(numericValue) === value;
}

/**
 * Accept only a compact, bounded JWT envelope before any decoding or credential use.
 * Missing and non-Bearer authorization values are delegated to the normal API error path;
 * a value using the Bearer scheme must itself be one exact compact JWT envelope.
 * @param value Authorization header value observed at the request edge, or null when absent.
 * @returns False only when a Bearer JWT envelope is structurally invalid or exceeds limits.
 */
export function isBoundedOidcBearer(value: string | null): boolean {
  if (value === null) return true;
  if (!/^Bearer(?:\s|$)/i.test(value)) return true;
  if (value.length > MAX_AUTHORIZATION_HEADER_LENGTH) return false;

  const match = value.match(/^Bearer (\S+)$/i);
  if (!match) return false;

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

function hasDuplicateTargetRepositoryKey(body: Uint8Array): boolean {
  const text = new TextDecoder().decode(body);
  let structureDepth = 0;
  let stringStart = -1;
  let inString = false;
  let escaped = false;
  let targetRepositoryKeyCount = 0;

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
      while (lookahead < text.length && /\s/.test(text[lookahead])) lookahead += 1;
      if (text[lookahead] !== ":") continue;

      const encodedKey = text.slice(stringStart + 1, index);
      try {
        const decodedKey = JSON.parse(`"${encodedKey}"`) as unknown;
        if (decodedKey === "target_repository") {
          targetRepositoryKeyCount += 1;
          if (targetRepositoryKeyCount > 1) return true;
        }
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

function cancelRequestBodyBestEffort(request: Request, reason: string): void {
  try {
    if (request.body === null) return;
    void request.body.cancel(reason).catch(() => undefined);
  } catch {
    // Cancellation is best-effort after the request has already been rejected.
  }
}

function cancelReaderBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>, reason: string): void {
  try {
    void reader.cancel(reason).catch(() => undefined);
  } catch {
    // Cancellation is best-effort after the request has already been rejected.
  }
}

/**
 * Consume and rebuild only JSON POST bodies within the exchange API's byte budget.
 * Streaming consumption prevents a chunked request from bypassing Content-Length checks.
 * The security-relevant top-level `target_repository` member must appear at most once after
 * JSON escape decoding so downstream parsing cannot silently apply last-key-wins semantics.
 * @param request Incoming request whose optional JSON body must be bounded before delegation.
 * @returns The original request when it is not a POST or has no body; otherwise a rebuilt
 * bounded request, or a typed failure describing the fail-closed response.
 */
export async function boundExchangeJsonBody(request: Request): Promise<BoundedExchangeRequest> {
  if (request.method !== "POST" || request.body === null) {
    return { ok: true, request };
  }

  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0];
  if (!/^[ \t]*application\/json[ \t]*$/i.test(mediaType)) {
    cancelRequestBodyBestEffort(request, "Noema exchange request body uses an unsupported media type");
    return {
      ok: false,
      failure: { reason: "unsupported_media_type", status: 415 },
    };
  }

  const declaredLength = request.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_EXCHANGE_JSON_BODY_BYTES
  ) {
    cancelRequestBodyBestEffort(request, "Noema exchange JSON body exceeds declared byte limit");
    return {
      ok: false,
      failure: { reason: "too_large", status: 413 },
    };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_EXCHANGE_JSON_BODY_BYTES) {
        cancelReaderBestEffort(reader, "Noema exchange JSON body exceeds byte limit");
        return {
          ok: false,
          failure: { reason: "too_large", status: 413 },
        };
      }
      chunks.push(value);
    }
  } catch {
    cancelReaderBestEffort(reader, "Noema exchange JSON body could not be read");
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
  if (
    boundedBody.length >= 3
    && boundedBody[0] === 0xef
    && boundedBody[1] === 0xbb
    && boundedBody[2] === 0xbf
  ) {
    return {
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    };
  }
  let boundedText: string;
  try {
    boundedText = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(boundedBody);
  } catch {
    return {
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    };
  }
  if (hasDuplicateTargetRepositoryKey(boundedBody)) {
    return {
      ok: false,
      failure: { reason: "duplicate_keys", status: 400 },
    };
  }
  try {
    const decodedBody: unknown = JSON.parse(boundedText);
    if (decodedBody === null || typeof decodedBody !== "object" || Array.isArray(decodedBody)) {
      return {
        ok: false,
        failure: { reason: "invalid_shape", status: 400 },
      };
    }
  } catch {
    // Preserve the existing downstream malformed-JSON response path after wire-level checks.
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

function exchangeMethodResponse(request: Request): Response {
  const traceId = traceIdFromRequest(request);
  const body = {
    ok: false,
    error_code: "ERR_VALIDATION_INPUT",
    message: "Method not allowed",
    details: {
      hint: "Use POST for credential exchange requests.",
      allowed_methods: "POST",
    },
    trace_id: traceId,
  };
  return new Response(
    request.method === "HEAD" ? null : JSON.stringify(body),
    {
      status: 405,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "pragma": "no-cache",
        "x-content-type-options": "nosniff",
        "x-trace-id": traceId,
        "x-latency-ms": "0",
        allow: "POST",
      },
    },
  );
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
      pragma: "no-cache",
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
      pragma: "no-cache",
      "x-content-type-options": "nosniff",
      "x-trace-id": traceId,
      "x-latency-ms": "0",
    },
  });
}

function exchangeBodyResponse(request: Request, failure: ExchangeBodyFailure): Response {
  const traceId = traceIdFromRequest(request);
  const tooLarge = failure.reason === "too_large";
  const duplicateKeys = failure.reason === "duplicate_keys";
  const invalidShape = failure.reason === "invalid_shape";
  const unsupportedMediaType = failure.reason === "unsupported_media_type";
  return new Response(JSON.stringify({
    ok: false,
    error_code: "ERR_VALIDATION_INPUT",
    message: tooLarge
      ? "Exchange JSON body exceeds accepted bounds"
      : duplicateKeys
        ? "Exchange JSON body contains duplicate target_repository keys"
        : invalidShape
          ? "Exchange JSON body must be an object"
          : unsupportedMediaType
            ? "Exchange request body requires application/json"
            : "Exchange JSON body could not be read",
    details: {
      hint: tooLarge
        ? "Send only the target_repository JSON field within the documented byte limit."
        : duplicateKeys
          ? "Send target_repository at most once; JSON escape-equivalent member names count as the same key."
          : invalidShape
            ? "Send a JSON object containing the optional target_repository field."
            : unsupportedMediaType
              ? "Send no request body, or send the optional target_repository body with Content-Type application/json."
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
      pragma: "no-cache",
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
 * Public Cloudflare Worker entrypoint that enforces request-body, OIDC-envelope, and
 * GitHub egress policy before delegating to the credential-exchange worker. It fails closed
 * on rejected security boundaries; requests outside /exchange retain the underlying contract.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/exchange") {
      if (request.method !== "POST") {
        return exchangeMethodResponse(request);
      }
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

      const appIdFailure: EgressFailure = {
        hint: "Configure GITHUB_APP_ID as a canonical positive decimal safe integer.",
        outcome: "misconfigured",
        policy: "github-app-id-canonical",
      };
      if (!isCanonicalPositiveSafeInteger(env.GITHUB_APP_ID)) {
        recordConfigurationFailure(request, appIdFailure);
        return githubApiConfigurationResponse(request, appIdFailure);
      }

      const installationId = env.GITHUB_APP_INSTALLATION_ID;
      if (installationId !== undefined && !isCanonicalPositiveSafeInteger(installationId)) {
        const installationIdFailure: EgressFailure = {
          hint: "Configure GITHUB_APP_INSTALLATION_ID as a canonical positive decimal safe integer when set.",
          outcome: "misconfigured",
          policy: "github-app-installation-id-canonical",
        };
        recordConfigurationFailure(request, installationIdFailure);
        return githubApiConfigurationResponse(request, installationIdFailure);
      }

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
