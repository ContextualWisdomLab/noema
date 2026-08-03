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

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const TRUSTED_GITHUB_OIDC_DISCOVERY =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const TRUSTED_GITHUB_OIDC_JWKS =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
const installations = new WeakMap<object, FetchInstallation>();

function blockedResponse(reason: "destination" | "redirect"): Response {
  return new Response(null, {
    status: 502,
    statusText: "Bad Gateway",
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

/** Return whether an outbound request is inside Noema's credential egress allowlist. */
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

/** Wrap fetch so credentials cannot follow redirects or leave reviewed GitHub endpoints. */
export function createFailClosedFetch(rawFetch: FetchLike): FetchLike {
  return async (input, init) => {
    if (!isTrustedCredentialEgress(input)) {
      return blockedResponse("destination");
    }

    const response = await rawFetch(input, {
      ...(init ?? {}),
      redirect: "manual",
    });
    if (response.redirected || (response.status >= 300 && response.status < 400)) {
      return blockedResponse("redirect");
    }
    return response;
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
