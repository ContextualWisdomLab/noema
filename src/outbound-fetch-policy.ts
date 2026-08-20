/**
 * Represents the fetch capability wrapped by Noema's credential-egress policy.
 * Implementations receive a request target plus optional request initialization and return the resulting response promise.
 */
export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

/**
 * Represents a mutable host on which Noema can install and later verify the fail-closed outbound fetch wrapper.
 * The fetch member is optional so missing runtime capability is detected explicitly instead of silently bypassed.
 */
export type FetchHost = {
  fetch?: FetchLike;
};

type FetchInstallation = {
  original: FetchLike;
  wrapped: FetchLike;
};

type BlockReason = "destination" | "request-policy" | "redirect" | "response-size" | "response-read" | "timeout" | "transport";

type GitHubApiOperation =
  | "repository-installation"
  | "app-installations"
  | "installation-token";

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const TRUSTED_GITHUB_OIDC_ORIGIN = "https://token.actions.githubusercontent.com";
const TRUSTED_GITHUB_OIDC_DISCOVERY =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const TRUSTED_GITHUB_OIDC_JWKS =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;
const MAX_OUTBOUND_RESPONSE_BYTES = 1_048_576;
const MAX_INSTALLATION_TOKEN_BODY_BYTES = 2_048;
const repositorySegmentPattern = "[A-Za-z0-9_.-]+";
const githubRepositoryInstallationPathPattern = new RegExp(
  `^/repos/${repositorySegmentPattern}/${repositorySegmentPattern}/installation$`,
);
const githubAppInstallationsPathPattern = /^\/app\/installations$/;
const githubInstallationTokenPathPattern =
  /^\/app\/installations\/[1-9][0-9]*\/access_tokens$/;
const githubRepositoryNamePattern = /^(?!\.{1,2}$)[A-Za-z0-9_.-]+$/;
const installations = new WeakMap<object, FetchInstallation>();

function blockedResponse(reason: BlockReason): Response {
  const timedOut = reason === "timeout";
  return new Response(null, {
    status: timedOut ? 504 : 502,
    statusText: timedOut ? "Gateway Timeout" : "Bad Gateway",
    headers: {
      "cache-control": "no-store",
      "pragma": "no-cache",
      "x-content-type-options": "nosniff",
      "x-noema-egress-policy": `blocked-${reason}`,
    },
  });
}

function outboundUrl(input: RequestInfo | URL): URL | undefined {
  try {
    return new URL(input instanceof Request ? input.url : String(input));
  } catch {
    return undefined;
  }
}

function outboundMethod(input: RequestInfo | URL, init: RequestInit | undefined): string {
  return (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
}

function outboundHeaders(input: RequestInfo | URL, init: RequestInit | undefined): Headers {
  if (init?.headers !== undefined) return new Headers(init.headers);
  if (input instanceof Request) return new Headers(input.headers);
  return new Headers();
}

function outboundBodyPresent(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  if (
    init
    && Object.prototype.hasOwnProperty.call(init, "body")
    && init.body !== null
    && init.body !== undefined
  ) {
    return true;
  }
  return input instanceof Request && input.body !== null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length
    && keys.every((key, index) => key === expectedKeys[index]);
}

function reviewedInstallationTokenBody(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
): boolean {
  if (input instanceof Request && init?.body === undefined) return false;
  if (typeof init?.body !== "string") return false;
  if (new TextEncoder().encode(init.body).byteLength > MAX_INSTALLATION_TOKEN_BODY_BYTES) {
    return false;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(init.body) as unknown;
  } catch {
    return false;
  }
  if (JSON.stringify(parsed) !== init.body) return false;
  if (!isRecord(parsed) || !hasExactKeys(parsed, ["permissions", "repositories"])) {
    return false;
  }

  const repositories = parsed.repositories;
  if (
    !Array.isArray(repositories)
    || repositories.length !== 1
    || typeof repositories[0] !== "string"
    || !githubRepositoryNamePattern.test(repositories[0])
  ) {
    return false;
  }

  const permissions = parsed.permissions;
  return isRecord(permissions)
    && hasExactKeys(permissions, ["checks", "contents", "pull_requests"])
    && permissions.pull_requests === "write"
    && permissions.contents === "read"
    && permissions.checks === "read";
}

function boundedOutboundSignal(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutSignal: AbortSignal,
): AbortSignal {
  const signals = [timeoutSignal];
  if (input instanceof Request) signals.push(input.signal);
  if (init?.signal) signals.push(init.signal);
  return AbortSignal.any(signals);
}

function ignoreCancellationBestEffort(cancel: () => Promise<void>): void {
  try {
    void cancel().catch(() => undefined);
  } catch {
    // Cleanup is best-effort after the response has already crossed a fail-closed rejection boundary.
  }
}

async function boundedOutboundResponse(response: Response): Promise<Response> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_OUTBOUND_RESPONSE_BYTES
  ) {
    if (response.body !== null) {
      ignoreCancellationBestEffort(() => response.body!.cancel(
        "Noema outbound response exceeds byte limit",
      ));
    }
    return blockedResponse("response-size");
  }

  if (response.body === null) return response;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OUTBOUND_RESPONSE_BYTES) {
        ignoreCancellationBestEffort(() => reader.cancel(
          "Noema outbound response exceeds byte limit",
        ));
        return blockedResponse("response-size");
      }
      chunks.push(value);
    }
  } catch {
    return blockedResponse("response-read");
  }

  const boundedBody = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    boundedBody.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(boundedBody, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function githubApiOperation(url: URL): GitHubApiOperation | undefined {
  if (url.search !== "") return undefined;
  if (githubRepositoryInstallationPathPattern.test(url.pathname)) {
    return "repository-installation";
  }
  if (githubAppInstallationsPathPattern.test(url.pathname)) {
    return "app-installations";
  }
  if (githubInstallationTokenPathPattern.test(url.pathname)) {
    return "installation-token";
  }
  return undefined;
}

/**
 * Checks whether an outbound destination is on the exact HTTPS credential-egress allowlist used by Noema.
 * @param input Candidate request target supplied to the protected fetch path.
 * @returns `true` only for reviewed GitHub API or GitHub OIDC discovery/JWKS allowlist destinations.
 */
export function isTrustedCredentialEgress(input: RequestInfo | URL): boolean {
  const url = outboundUrl(input);
  if (
    !url
    || url.protocol !== "https:"
    || url.username !== ""
    || url.password !== ""
    || url.hash !== ""
  ) {
    return false;
  }

  if (url.origin === TRUSTED_GITHUB_API_ORIGIN) {
    return true;
  }

  return url.href === TRUSTED_GITHUB_OIDC_DISCOVERY
    || url.href === TRUSTED_GITHUB_OIDC_JWKS;
}

/**
 * Enforces endpoint-specific request shape so credentials cannot cross protocol roles or accompany public OIDC metadata traffic.
 * @param input Candidate destination that must already belong to the reviewed credential-egress allowlist.
 * @param init Optional request initialization containing method, headers, and body semantics to validate.
 * @returns `true` only when the request matches the reviewed credential protocol for its exact endpoint role.
 */
export function isTrustedCredentialEgressRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  if (!isTrustedCredentialEgress(input)) return false;

  const url = outboundUrl(input)!;
  const method = outboundMethod(input, init);
  const headers = outboundHeaders(input, init);
  const bodyPresent = outboundBodyPresent(input, init);

  if (url.origin === TRUSTED_GITHUB_OIDC_ORIGIN) {
    return (
      method === "GET"
      && !bodyPresent
      && !headers.has("authorization")
      && !headers.has("cookie")
      && !headers.has("proxy-authorization")
    );
  }

  if (
    headers.has("cookie")
    || headers.has("proxy-authorization")
    || headers.has("x-http-method-override")
    || headers.has("x-method-override")
  ) {
    return false;
  }

  const authorization = headers.get("authorization")?.trim();
  if (!authorization) {
    return method === "GET" && !bodyPresent;
  }
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return false;
  }

  const operation = githubApiOperation(url);
  if (operation === "repository-installation" || operation === "app-installations") {
    return method === "GET" && !bodyPresent;
  }
  return operation === "installation-token"
    && method === "POST"
    && reviewedInstallationTokenBody(input, init);
}

/**
 * Wraps fetch with fail-closed credential destination, request-role, redirect, response-size, timeout, and transport enforcement.
 * @param rawFetch Trusted underlying fetch implementation that performs only requests admitted by the wrapper.
 * @returns A fetch-compatible function that blocks redirects, transport failures, and timeout violations instead of leaking credentials or surfacing ambiguous internal errors.
 */
export function createFailClosedFetch(rawFetch: FetchLike): FetchLike {
  return async (input, init) => {
    if (!isTrustedCredentialEgress(input)) {
      return blockedResponse("destination");
    }
    if (!isTrustedCredentialEgressRequest(input, init)) {
      return blockedResponse("request-policy");
    }

    const timeoutController = new AbortController();
    const timeoutReason = new DOMException(
      "Noema outbound credential fetch deadline exceeded",
      "TimeoutError",
    );
    const timeoutHandle = setTimeout(
      () => timeoutController.abort(timeoutReason),
      OUTBOUND_FETCH_TIMEOUT_MS,
    );
    const signal = boundedOutboundSignal(input, init, timeoutController.signal);

    try {
      const response = await rawFetch(input, {
        ...(init ?? {}),
        redirect: "manual",
        signal,
      });
      if (response.redirected || (response.status >= 300 && response.status < 400)) {
        return blockedResponse("redirect");
      }
      return await boundedOutboundResponse(response);
    } catch (error) {
      if (signal.aborted && signal.reason === timeoutReason) {
        return blockedResponse("timeout");
      }
      if (signal.aborted) {
        throw error;
      }
      return blockedResponse("transport");
    } finally {
      clearTimeout(timeoutHandle);
    }
  };
}

/**
 * Installs the fail-closed fetch policy exactly once on a host and detects later fetch replacement as tamper evidence.
 * @param host Mutable fetch host to protect; defaults to the current global runtime object.
 * @returns `true` only when the wrapper is installed and still intact, otherwise `false` without bypassing policy.
 */
export function ensureGlobalOutboundFetchPolicy(
  host: FetchHost = globalThis,
): boolean {
  const key = host as object;
  const existing = installations.get(key);
  if (existing) {
    return host.fetch === existing.wrapped;
  }

  const current = host.fetch;
  if (typeof current !== "function") {
    return false;
  }

  const wrapped = createFailClosedFetch(current.bind(host));
  try {
    host.fetch = wrapped;
  } catch {
    return false;
  }

  if (host.fetch !== wrapped) {
    return false;
  }

  installations.set(key, { original: current, wrapped });
  return true;
}

/**
 * Restores an installed fetch host during tests while leaving production policy installation one-way for normal operation.
 * @param host Mutable fetch host whose test-only installation state should be removed.
 * @returns Nothing; cleanup is best-effort and never masks the security behavior being tested.
 */
export function resetGlobalOutboundFetchPolicy(
  host: FetchHost = globalThis,
): void {
  const key = host as object;
  const existing = installations.get(key);
  if (!existing) {
    return;
  }

  if (host.fetch === existing.wrapped) {
    try {
      host.fetch = existing.original;
    } catch {
      // Test cleanup must not mask the security behavior under examination.
    }
  }
  installations.delete(key);
}
