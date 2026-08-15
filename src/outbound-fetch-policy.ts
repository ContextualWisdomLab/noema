export type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type FetchHost = {
  fetch?: FetchLike;
};

type FetchInstallation = {
  original: FetchLike;
  wrapped: FetchLike;
};

type BlockReason = "destination" | "request-policy" | "redirect" | "response-size" | "timeout";

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
  return keys.length === expected.length
    && keys.every((key, index) => key === [...expected].sort()[index]);
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

async function boundedOutboundResponse(response: Response): Promise<Response> {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null
    && /^\d+$/.test(declaredLength)
    && Number(declaredLength) > MAX_OUTBOUND_RESPONSE_BYTES
  ) {
    if (response.body !== null) {
      try {
        await response.body.cancel("Noema outbound response exceeds byte limit");
      } catch {
        // Cancellation is best-effort after the response has already been rejected.
      }
    }
    return blockedResponse("response-size");
  }

  if (response.body === null) return response;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_OUTBOUND_RESPONSE_BYTES) {
      try {
        await reader.cancel("Noema outbound response exceeds byte limit");
      } catch {
        // Cancellation is best-effort after the response has already been rejected.
      }
      return blockedResponse("response-size");
    }
    chunks.push(value);
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

/** Return whether an outbound request is inside Noema's credential egress destination allowlist. */
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
 * Enforce endpoint-specific request shape so credentials cannot cross protocol roles.
 * OIDC metadata is public GET-only traffic with no body or ambient credentials.
 * GitHub REST traffic is restricted to the reviewed App-JWT installation operations:
 * repository lookup, app installation inventory, and least-privilege installation-token issuance.
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
 * Wrap fetch so credentials cannot leave reviewed GitHub endpoints, cross endpoint roles,
 * follow redirects, return unbounded bodies, or hold an exchange request open indefinitely.
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
      throw error;
    } finally {
      clearTimeout(timeoutHandle);
    }
  };
}

/** Install the policy once on a fetch host and detect later tampering fail-closed. */
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

/** Restore a host after tests; production never removes the installed policy. */
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
