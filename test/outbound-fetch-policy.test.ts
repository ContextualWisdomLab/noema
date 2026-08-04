import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  ensureGlobalOutboundFetchPolicy,
  isTrustedCredentialEgress,
  resetGlobalOutboundFetchPolicy,
  type FetchHost,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential-bearing outbound fetch policy", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("allows only GitHub API and pinned GitHub OIDC endpoints", () => {
    expect(isTrustedCredentialEgress("https://api.github.com/app/installations")).toBe(true);
    expect(isTrustedCredentialEgress(new URL("https://api.github.com/repos/cwl/noema?per_page=100"))).toBe(true);
    expect(isTrustedCredentialEgress(new Request(
      "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
    ))).toBe(true);
    expect(isTrustedCredentialEgress(
      "https://token.actions.githubusercontent.com/.well-known/jwks",
    )).toBe(true);
  });

  it.each([
    "not a URL",
    "http://api.github.com/app/installations",
    "https://user:secret@api.github.com/app/installations",
    "https://api.github.com.evil.example/app/installations",
    "https://api.github.com:444/app/installations",
    "https://api.github.com/app/installations#fragment",
    "https://token.actions.githubusercontent.com/.well-known/openid-configuration?tenant=other",
    "https://token.actions.githubusercontent.com/.well-known/jwks/extra",
    "https://example.com/.well-known/jwks",
  ])("rejects an outbound destination outside the reviewed allowlist: %s", (value) => {
    expect(isTrustedCredentialEgress(value)).toBe(false);
  });

  it("forces manual redirects while preserving the requested operation and request cancellation", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("ok"));
    const wrapped = createFailClosedFetch(rawFetch);
    const request = new Request("https://api.github.com/app/installations", {
      method: "GET",
      headers: { authorization: "Bearer sensitive" },
    });

    const response = await wrapped(request, { redirect: "follow" });

    expect(response.status).toBe(200);
    const [forwardedRequest, forwardedInit] = rawFetch.mock.calls[0];
    expect(forwardedRequest).toBe(request);
    expect(forwardedInit?.redirect).toBe("manual");
    expect(forwardedInit?.signal).toBeInstanceOf(AbortSignal);
  });

  it("blocks an untrusted destination before the network call", async () => {
    const rawFetch = vi.fn<FetchLike>();
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped("https://evil.example/collect", {
      headers: { authorization: "Bearer sensitive" },
    });

    expect(rawFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-destination");
    expect(response.headers.get("location")).toBeNull();
  });

  it("converts a 3xx response into a bodyless fail-closed gateway response", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response(null, {
      status: 302,
      headers: { location: "https://evil.example/collect" },
    }));
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped("https://api.github.com/app/installations");

    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-redirect");
    expect(response.headers.get("location")).toBeNull();
    expect(await response.text()).toBe("");
  });

  it("also rejects a response already marked as redirected", async () => {
    const redirectedResponse = {
      redirected: true,
      status: 200,
    } as Response;
    const rawFetch = vi.fn<FetchLike>(async () => redirectedResponse);
    const wrapped = createFailClosedFetch(rawFetch);

    const response = await wrapped("https://api.github.com/app/installations");

    expect(response.status).toBe(502);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-redirect");
  });

  it("aborts a stalled trusted subrequest after ten seconds and returns a bodyless 504", async () => {
    vi.useFakeTimers();
    const rawFetch = vi.fn<FetchLike>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("expected a bounded outbound signal"));
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta");
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(504);
    expect(response.statusText).toBe("Gateway Timeout");
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-timeout");
    expect(await response.text()).toBe("");
    expect(rawFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("preserves caller cancellation instead of misclassifying it as an egress timeout", async () => {
    const rawFetch = vi.fn<FetchLike>(async (_input, init) => new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) {
        reject(new Error("expected a composed outbound signal"));
        return;
      }
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    }));
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled", "AbortError");

    const pending = wrapped("https://api.github.com/meta", { signal: caller.signal });
    caller.abort(reason);

    await expect(pending).rejects.toBe(reason);
  });

  it("installs once, detects tampering, and restores an untouched host", async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => new Response("ok"));
    const host: FetchHost = { fetch: nativeFetch };

    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(true);
    const wrapped = host.fetch;
    expect(wrapped).not.toBe(nativeFetch);
    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(true);

    const response = await host.fetch!("https://api.github.com/meta");
    expect(response.status).toBe(200);
    const [forwardedInput, forwardedInit] = nativeFetch.mock.calls[0];
    expect(forwardedInput).toBe("https://api.github.com/meta");
    expect(forwardedInit?.redirect).toBe("manual");
    expect(forwardedInit?.signal).toBeInstanceOf(AbortSignal);

    const tampered = vi.fn<FetchLike>();
    host.fetch = tampered;
    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(false);
    resetGlobalOutboundFetchPolicy(host);
    expect(host.fetch).toBe(tampered);
  });

  it("restores the original fetch when the installed wrapper is intact", () => {
    const nativeFetch = vi.fn<FetchLike>();
    const host: FetchHost = { fetch: nativeFetch };

    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(true);
    resetGlobalOutboundFetchPolicy(host);

    expect(host.fetch).toBe(nativeFetch);
    resetGlobalOutboundFetchPolicy(host);
  });

  it("fails closed when fetch is missing, immutable, or silently replaced", () => {
    expect(ensureGlobalOutboundFetchPolicy({})).toBe(false);

    const nativeFetch = vi.fn<FetchLike>();
    const immutableHost = Object.freeze<FetchHost>({ fetch: nativeFetch });
    expect(ensureGlobalOutboundFetchPolicy(immutableHost)).toBe(false);

    let current: FetchLike | undefined = nativeFetch;
    const silentHost = {} as FetchHost;
    Object.defineProperty(silentHost, "fetch", {
      configurable: true,
      get: () => current,
      set: () => {
        current = nativeFetch;
      },
    });
    expect(ensureGlobalOutboundFetchPolicy(silentHost)).toBe(false);
  });
});
