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

type BlockReason = "destination" | "redirect" | "timeout";

const TRUSTED_GITHUB_API_ORIGIN = "https://api.github.com";
const TRUSTED_GITHUB_OIDC_DISCOVERY =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const TRUSTED_GITHUB_OIDC_JWKS =
  "https://token.actions.githubusercontent.com/.well-known/jwks";
const OUTBOUND_FETCH_TIMEOUT_MS = 10_000;
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

/**
 * Wrap fetch so credentials cannot leave reviewed GitHub endpoints, follow redirects,
 * or hold an exchange request open indefinitely.
 */
export function createFailClosedFetch(rawFetch: FetchLike): FetchLike {
  return async (input, init) => {
    if (!isTrustedCredentialEgress(input)) {
      return blockedResponse("destination");
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
      return response;
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
