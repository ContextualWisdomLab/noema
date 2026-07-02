export interface Env {
  ALLOWED_ISSUER: string;
  ALLOWED_AUDIENCE: string;
  ALLOWED_REPOSITORY_OWNER: string;
  ALLOWED_WORKFLOW_REPOSITORY: string;
  ALLOWED_WORKFLOW_REF_PREFIX: string;
  GITHUB_API_BASE: string;
  GITHUB_APP_ID: string;
  GITHUB_APP_PRIVATE_KEY_PEM: string;
  GITHUB_APP_INSTALLATION_ID?: string;
  NOEMA_RATE_LIMIT_PER_MINUTE?: string;
  NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS?: string;
  NOEMA_INSTALLATION_CACHE_TTL_SECONDS?: string;
}

type JwtPayload = {
  iss?: string;
  aud?: string | string[];
  repository?: string;
  repository_owner?: string;
  workflow_ref?: string;
  job_workflow_ref?: string;
  sub?: string;
  ref?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
};

type ExchangeRequestBody = {
  target_repository?: unknown;
};

type JsonWebKeySet = {
  keys: Array<JsonWebKey & { kid?: string; kty?: string }>;
};

type ErrorCode =
  | "ERR_VALIDATION_INPUT"
  | "ERR_AUTH_MISSING"
  | "ERR_AUTH_INVALID"
  | "ERR_REPO_NOT_ALLOWED"
  | "ERR_WORKFLOW_NOT_ALLOWED"
  | "ERR_TOKEN_MALFORMED"
  | "ERR_OIDC_VERIFICATION"
  | "ERR_GITHUB_API"
  | "ERR_GITHUB_INSTALLATION"
  | "ERR_RATE_LIMIT"
  | "ERR_INTERNAL";

type ErrorDetails = Record<string, string>;

type StandardErrorResponse = {
  ok: false;
  error_code: ErrorCode;
  message: string;
  details?: ErrorDetails;
  trace_id: string;
};

type StandardSuccessResponse<T> = {
  ok: true;
  data: T;
  trace_id: string;
};

type ExchangeResult = {
  repository?: string;
  workflow_ref?: string;
  oidc_sub?: string;
  token_expires_at?: string;
  response: Response;
};

type InstallationToken = {
  token: string;
  expires_at: string;
};

type RateLimitBucket = {
  windowStartMs: number;
  count: number;
};

type TimedCache<T> = {
  value: T;
  expiresAtMs: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const rateLimitWindowMs = 60_000;
let oidcKeysCache: TimedCache<JsonWebKeySet> | undefined;
const installationIdCache = new Map<string, TimedCache<string>>();

class ApiError extends Error {
  constructor(
    public code: ErrorCode,
    public status: number,
    message: string,
    public details?: ErrorDetails,
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

const errorHints: Record<ErrorCode, string> = {
  ERR_VALIDATION_INPUT: "Check the endpoint, HTTP method, content-type, and JSON body.",
  ERR_AUTH_MISSING: "Send a GitHub Actions OIDC token in the Authorization bearer header.",
  ERR_AUTH_INVALID: "Request a fresh OIDC token with the configured issuer, audience, and time window.",
  ERR_REPO_NOT_ALLOWED: "Verify target_repository and repository_owner are in the allowed organization.",
  ERR_WORKFLOW_NOT_ALLOWED: "Run the request from the configured central workflow ref.",
  ERR_TOKEN_MALFORMED: "Request a new GitHub Actions OIDC token; the provided token was not parseable or acceptable.",
  ERR_OIDC_VERIFICATION: "Retry after GitHub OIDC JWKS availability is confirmed.",
  ERR_GITHUB_API: "Retry after checking GitHub API availability and the app installation state.",
  ERR_GITHUB_INSTALLATION: "Verify the GitHub App is installed on the target repository.",
  ERR_RATE_LIMIT: "Back off and retry after the rate-limit window resets.",
  ERR_INTERNAL: "Use trace_id to find the matching operational log entry.",
};

const trustedHeaderValuePattern = /^[A-Za-z0-9._:-]+$/;
const clientIdentifierPattern = /^[A-Za-z0-9.:%_,-]+$/;
const maxTrustedHeaderLength = 128;

/* v8 ignore start */
function jsonResponse(body: StandardErrorResponse | StandardSuccessResponse<unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
    },
  });
}

function trustedTraceHeader(value: string | null): string | undefined {
  const candidate = value?.trim();
  if (!candidate || candidate.length > maxTrustedHeaderLength) return undefined;
  if (!trustedHeaderValuePattern.test(candidate)) return undefined;
  return candidate;
}

function traceIdFromRequest(request: Request): string {
  return trustedTraceHeader(request.headers.get("x-request-id"))
    || trustedTraceHeader(request.headers.get("x-correlation-id"))
    || crypto.randomUUID();
}

function safeHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function configuredRateLimit(env: Env): number {
  const limit = Number(env.NOEMA_RATE_LIMIT_PER_MINUTE ?? "60");
  if (!Number.isFinite(limit) || limit <= 0) return 60;
  return Math.floor(limit);
}

function configuredTtlMs(raw: string | undefined, defaultSeconds: number, maxSeconds: number): number {
  const seconds = Number(raw ?? String(defaultSeconds));
  if (!Number.isFinite(seconds) || seconds <= 0) return defaultSeconds * 1000;
  return Math.min(Math.floor(seconds), maxSeconds) * 1000;
}

function valueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function requestClientKey(request: Request, route: string): string {
  const client = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
  const candidate = client.trim();
  if (!candidate) return `${route}:unknown`;
  if (candidate.length <= maxTrustedHeaderLength && clientIdentifierPattern.test(candidate)) {
    return `${route}:${candidate}`;
  }
  return `${route}:hash:${safeHash(candidate)}`;
}

function enforceRateLimit(request: Request, env: Env, route: string) {
  const limit = configuredRateLimit(env);
  const now = Date.now();
  const key = requestClientKey(request, route);
  const bucket = rateLimitBuckets.get(key);

  if (!bucket || now - bucket.windowStartMs >= rateLimitWindowMs) {
    rateLimitBuckets.set(key, { windowStartMs: now, count: 1 });
    cleanupRateLimitBuckets(now);
    return;
  }

  if (bucket.count >= limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((rateLimitWindowMs - (now - bucket.windowStartMs)) / 1000));
    throw new ApiError("ERR_RATE_LIMIT", 429, "Rate limit exceeded", {
      retry_after_seconds: String(retryAfterSeconds),
      client_hash: safeHash(key),
    });
  }

  bucket.count += 1;
}

function cleanupRateLimitBuckets(now: number) {
  if (rateLimitBuckets.size < 10_000) return;
  for (const [key, bucket] of rateLimitBuckets) {
    if (now - bucket.windowStartMs >= rateLimitWindowMs) {
      rateLimitBuckets.delete(key);
    }
  }
}

function successResponse<T>(data: T, traceId: string, status = 200): Response {
  const response = jsonResponse({ ok: true, data, trace_id: traceId }, status);
  response.headers.set("x-trace-id", traceId);
  return response;
}

function errorResponse(code: ErrorCode, status: number, message: string, traceId: string, details?: ErrorDetails): Response {
  const responseDetails: ErrorDetails = {
    hint: errorHints[code],
    ...(details ?? {}),
  };
  const response = jsonResponse({
    ok: false,
    error_code: code,
    message,
    details: responseDetails,
    trace_id: traceId,
  }, status);
  response.headers.set("x-trace-id", traceId);
  if (code === "ERR_RATE_LIMIT" && responseDetails.retry_after_seconds) {
    response.headers.set("retry-after", responseDetails.retry_after_seconds);
  }
  if (status === 405 && responseDetails.allowed_methods) {
    response.headers.set("allow", responseDetails.allowed_methods);
  }
  if (status === 401) {
    const challengeError = code === "ERR_AUTH_MISSING" ? "invalid_request" : "invalid_token";
    response.headers.set("www-authenticate", `Bearer realm="noema", error="${challengeError}"`);
  }
  return response;
}

function withOperationalHeaders(response: Response, traceId: string, latencyMs: number): Response {
  response.headers.set("x-trace-id", traceId);
  response.headers.set("x-latency-ms", String(latencyMs));
  return response;
}

function logRequest({
  route,
  method,
  status_code,
  latency_ms,
  trace_id,
  error_code,
  repository,
  workflow_ref,
  oidc_sub,
  token_expires_at,
}: {
  route: string;
  method: string;
  status_code: number;
  latency_ms: number;
  trace_id: string;
  error_code?: ErrorCode;
  repository?: string;
  workflow_ref?: string;
  oidc_sub?: string;
  token_expires_at?: string;
}) {
  const payload = {
    event: "http_request",
    route,
    method,
    status_code,
    latency_ms,
    trace_id,
    error_code,
    repository,
    workflow_ref,
    oidc_sub,
    token_expires_at,
  };
  console.log(JSON.stringify(payload));
}
/* v8 ignore stop */

/* v8 ignore start */
function base64UrlDecode(input: string): Uint8Array<ArrayBuffer> {
  const padded = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function base64UrlEncode(bytes: ArrayBuffer | Uint8Array<ArrayBufferLike>): string {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of array) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeJson<T>(segment: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlDecode(segment))) as T;
}

async function fetchGithubOidcKeys(env: Env, forceRefresh = false): Promise<JsonWebKeySet> {
  const now = Date.now();
  if (!forceRefresh && oidcKeysCache && oidcKeysCache.expiresAtMs > now) {
    return oidcKeysCache.value;
  }

  const discovery = await fetch("https://token.actions.githubusercontent.com/.well-known/openid-configuration");
  if (!discovery.ok) throw new ApiError("ERR_OIDC_VERIFICATION", 502, "failed to fetch GitHub OIDC discovery document");
  const { jwks_uri: jwksUri } = (await discovery.json()) as { jwks_uri?: string };
  if (!jwksUri) throw new ApiError("ERR_OIDC_VERIFICATION", 502, "GitHub OIDC discovery document did not include jwks_uri");
  const keys = await fetch(jwksUri);
  if (!keys.ok) throw new ApiError("ERR_OIDC_VERIFICATION", 502, "failed to fetch GitHub OIDC JWKS");
  const value = (await keys.json()) as JsonWebKeySet;
  oidcKeysCache = {
    value,
    expiresAtMs: now + configuredTtlMs(env.NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS, 300, 3600),
  };
  return value;
}

async function verifyGithubOidcJwt(token: string, env: Env): Promise<JwtPayload> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new ApiError("ERR_TOKEN_MALFORMED", 400, "OIDC token is not a JWT");

  try {
    const header = decodeJson<{ kid?: string; alg?: string }>(parts[0]);
    const payload = decodeJson<JwtPayload>(parts[1]);
    if (header.alg !== "RS256" || !header.kid) {
      throw new ApiError("ERR_TOKEN_MALFORMED", 401, "OIDC token header is not acceptable");
    }

    let jwks = await fetchGithubOidcKeys(env);
    let jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    if (!jwk) {
      jwks = await fetchGithubOidcKeys(env, true);
      jwk = jwks.keys.find((key) => key.kid === header.kid && key.kty === "RSA");
    }
    if (!jwk) throw new ApiError("ERR_OIDC_VERIFICATION", 401, "OIDC signing key was not found");

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlDecode(parts[2]);
    const verified = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signature, signed);
    if (!verified) throw new ApiError("ERR_OIDC_VERIFICATION", 401, "OIDC signature verification failed");

    const now = Math.floor(Date.now() / 1000);
    if (payload.iss !== env.ALLOWED_ISSUER) throw new ApiError("ERR_AUTH_INVALID", 401, "OIDC issuer is not allowed");
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!audiences.includes(env.ALLOWED_AUDIENCE)) throw new ApiError("ERR_AUTH_INVALID", 401, "OIDC audience is not allowed");
    if (payload.repository_owner !== env.ALLOWED_REPOSITORY_OWNER) throw new ApiError("ERR_REPO_NOT_ALLOWED", 403, "OIDC repository owner is not allowed");

    const workflowRef = payload.job_workflow_ref || payload.workflow_ref || "";
    if (!workflowRef.startsWith(env.ALLOWED_WORKFLOW_REF_PREFIX)) {
      throw new ApiError("ERR_WORKFLOW_NOT_ALLOWED", 403, "OIDC workflow_ref is not allowed");
    }
    if (!workflowRef.startsWith(`${env.ALLOWED_WORKFLOW_REPOSITORY}/.github/workflows/`)) {
      throw new ApiError("ERR_WORKFLOW_NOT_ALLOWED", 403, "OIDC workflow repository is not allowed");
    }
    if (typeof payload.nbf === "number" && payload.nbf > now + 30) {
      throw new ApiError("ERR_AUTH_INVALID", 401, "OIDC token is not valid yet");
    }
    if (typeof payload.exp !== "number" || payload.exp < now - 30) {
      throw new ApiError("ERR_AUTH_INVALID", 401, "OIDC token is expired");
    }

    return payload;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof SyntaxError || error instanceof TypeError) {
      throw new ApiError("ERR_TOKEN_MALFORMED", 400, "OIDC token is malformed");
    }
    throw new ApiError("ERR_OIDC_VERIFICATION", 401, "OIDC token verification failed");
  }
}

function validateRepositoryName(repository: string, env: Env): string {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
    throw new ApiError("ERR_VALIDATION_INPUT", 400, "target_repository is not a valid owner/name repository");
  }
  const [owner] = repository.split("/", 1);
  if (owner !== env.ALLOWED_REPOSITORY_OWNER) {
    throw new ApiError("ERR_REPO_NOT_ALLOWED", 403, "target_repository owner is not allowed");
  }
  return repository;
}

async function importGithubAppPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem.replace(/-----BEGIN [^-]+-----/g, "").replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const der = base64UrlDecode(body.replace(/\+/g, "-").replace(/\//g, "_"));
  return crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
}

async function createGitHubAppJwt(env: Env): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const payload = base64UrlEncode(new TextEncoder().encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })));
  const key = await importGithubAppPrivateKey(env.GITHUB_APP_PRIVATE_KEY_PEM);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64UrlEncode(signature)}`;
}

async function githubJson(path: string, init: RequestInit, env: Env): Promise<any> {
  const response = await fetch(`${env.GITHUB_API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      "user-agent": "noema",
      "x-github-api-version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    if (response.status === 429) {
      throw new ApiError("ERR_RATE_LIMIT", 429, "GitHub API rate limit reached");
    }
    if (response.status >= 500) {
      throw new ApiError("ERR_GITHUB_API", 502, "GitHub API is temporarily unavailable");
    }
    throw new ApiError("ERR_GITHUB_API", response.status >= 400 && response.status < 500 ? 400 : 500, "GitHub API request failed");
  }
  return response.json();
}

async function resolveInstallationId(appJwt: string, repository: string, env: Env): Promise<string> {
  if (env.GITHUB_APP_INSTALLATION_ID) return env.GITHUB_APP_INSTALLATION_ID;
  const now = Date.now();
  const cacheKey = `${env.GITHUB_API_BASE}:${env.GITHUB_APP_ID}:${repository}`;
  const cached = installationIdCache.get(cacheKey);
  if (cached && cached.expiresAtMs > now) {
    return cached.value;
  }
  if (cached) {
    installationIdCache.delete(cacheKey);
  }

  const installation = await githubJson(`/repos/${repository}/installation`, {
    headers: { authorization: `Bearer ${appJwt}` },
  }, env);
  if (!installation.id) throw new ApiError("ERR_GITHUB_INSTALLATION", 500, "GitHub App installation id was not found");
  const installationId = String(installation.id);
  installationIdCache.set(cacheKey, {
    value: installationId,
    expiresAtMs: now + configuredTtlMs(env.NOEMA_INSTALLATION_CACHE_TTL_SECONDS, 600, 3600),
  });
  return installationId;
}

async function createInstallationToken(repository: string, env: Env): Promise<InstallationToken> {
  const appJwt = await createGitHubAppJwt(env);
  const installationId = await resolveInstallationId(appJwt, repository, env);
  const token = await githubJson(`/app/installations/${installationId}/access_tokens`, {
    method: "POST",
    headers: { authorization: `Bearer ${appJwt}` },
    body: JSON.stringify({ repositories: [repository.split("/", 2)[1]], permissions: { pull_requests: "write", contents: "read", checks: "read" } }),
  }, env);
  if (!token.token) {
    throw new ApiError("ERR_GITHUB_INSTALLATION", 500, "GitHub installation token response was empty", {
      field: "token",
      reason: "required",
    });
  }
  if (!token.expires_at || Number.isNaN(Date.parse(String(token.expires_at)))) {
    throw new ApiError("ERR_GITHUB_INSTALLATION", 500, "GitHub installation token response did not include a valid expires_at", {
      field: "expires_at",
      reason: "must be a valid timestamp",
    });
  }
  return {
    token: String(token.token),
    expires_at: String(token.expires_at),
  };
}

async function parseExchangeRequestBody(request: Request): Promise<ExchangeRequestBody> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return {};
  let body: unknown;
  try {
    body = await request.json();
  } catch (error) {
    throw new ApiError("ERR_VALIDATION_INPUT", 400, "Malformed JSON request body");
  }
  if (!body || typeof body !== "object") return {};
  return body as ExchangeRequestBody;
}

async function createRepositoryInstallationToken(request: Request, claims: JwtPayload, env: Env): Promise<{ repository: string; token: string; token_expires_at: string }> {
  const body = await parseExchangeRequestBody(request);
  const rawTargetRepository = body.target_repository;
  if (rawTargetRepository !== undefined && typeof rawTargetRepository !== "string") {
    throw new ApiError("ERR_VALIDATION_INPUT", 400, "target_repository must be a string", {
      field: "target_repository",
      reason: "must be a string",
      received_type: valueType(rawTargetRepository),
    });
  }
  const requestedRepository = (rawTargetRepository ?? claims.repository ?? "").trim();
  const repository = validateRepositoryName(requestedRepository, env);
  if (claims.repository !== repository && claims.repository !== env.ALLOWED_WORKFLOW_REPOSITORY) {
    throw new ApiError("ERR_REPO_NOT_ALLOWED", 403, "OIDC repository cannot request token for target_repository");
  }
  const token = await createInstallationToken(repository, env);
  return { repository, token: token.token, token_expires_at: token.expires_at };
}
/* v8 ignore stop */

async function handleExchange(request: Request, env: Env, traceId: string): Promise<ExchangeResult> {
  if (request.method !== "POST") {
    throw new ApiError("ERR_VALIDATION_INPUT", 405, "Method not allowed", { allowed_methods: "POST" });
  }
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError("ERR_AUTH_MISSING", 401, "Missing bearer token");
  /* v8 ignore start */
  const claims = await verifyGithubOidcJwt(match[1], env);
  const oidc_sub = claims.sub ? safeHash(claims.sub).slice(0, 16) : undefined;
  const { repository, token, token_expires_at } = await createRepositoryInstallationToken(request, claims, env);
  const workflow_ref = claims.job_workflow_ref || claims.workflow_ref || "";
  return {
    repository,
    workflow_ref,
    oidc_sub,
    token_expires_at,
    response: successResponse(
      { token, repository, workflow_ref, token_expires_at },
      traceId,
      200,
    ),
  };
  /* v8 ignore stop */
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const traceId = traceIdFromRequest(request);
    const startedAt = performance.now();
    const url = new URL(request.url);
    const method = request.method;
    const route = url.pathname;
    let status = 200;
    let repository: string | undefined;
    let workflow_ref: string | undefined;
    let oidc_sub: string | undefined;
    let token_expires_at: string | undefined;

    try {
      if (url.pathname === "/health") {
        status = 200;
        const response = successResponse({ name: "noema" }, traceId);
        const latency_ms = Math.round(performance.now() - startedAt);
        logRequest({
          route,
          method,
          status_code: status,
          latency_ms,
          trace_id: traceId,
        });
        return withOperationalHeaders(response, traceId, latency_ms);
      }
      if (url.pathname === "/exchange") {
        enforceRateLimit(request, env, route);
        const exchange = await handleExchange(request, env, traceId);
        repository = exchange.repository;
        workflow_ref = exchange.workflow_ref;
        oidc_sub = exchange.oidc_sub;
        token_expires_at = exchange.token_expires_at;
        const response = exchange.response;
        status = response.status;
        const latency_ms = Math.round(performance.now() - startedAt);
        logRequest({
          route,
          method,
          status_code: status,
          latency_ms,
          trace_id: traceId,
          repository,
          workflow_ref,
          oidc_sub,
          token_expires_at,
        });
        return withOperationalHeaders(response, traceId, latency_ms);
      }
      status = 404;
      const response = errorResponse("ERR_VALIDATION_INPUT", 404, "Endpoint not found", traceId, { path: route });
      const latency_ms = Math.round(performance.now() - startedAt);
      logRequest({
        route,
        method,
        status_code: status,
        latency_ms,
        trace_id: traceId,
        error_code: "ERR_VALIDATION_INPUT",
      });
      return withOperationalHeaders(response, traceId, latency_ms);
    } catch (error) {
      if (error instanceof ApiError) {
        status = error.status;
        const response = errorResponse(error.code, error.status, error.message, traceId, error.details);
        const latency_ms = Math.round(performance.now() - startedAt);
        logRequest({
          route,
          method,
          status_code: status,
          latency_ms,
          trace_id: traceId,
          error_code: error.code,
        });
        return withOperationalHeaders(response, traceId, latency_ms);
      }

      const response = errorResponse("ERR_INTERNAL", 500, "Internal server error", traceId);
      const latency_ms = Math.round(performance.now() - startedAt);
      logRequest({
        route,
        method,
        status_code: 500,
        latency_ms,
        trace_id: traceId,
        error_code: "ERR_INTERNAL",
      });
      return withOperationalHeaders(response, traceId, latency_ms);
    }
  },
};
