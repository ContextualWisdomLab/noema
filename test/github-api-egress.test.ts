import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  isBoundedOidcBearer,
  isTrustedGithubApiBase,
  type Env,
} from "../src/entrypoint";
import {
  resetGlobalOutboundFetchPolicy,
  type FetchHost,
} from "../src/outbound-fetch-policy";

const nativeFetch = globalThis.fetch;

describe("GitHub API egress policy", () => {
  afterEach(() => {
    resetGlobalOutboundFetchPolicy();
    (globalThis as FetchHost).fetch = nativeFetch;
    vi.restoreAllMocks();
  });

  it("accepts only the GitHub Cloud REST API root", () => {
    expect(isTrustedGithubApiBase("https://api.github.com")).toBe(true);
    expect(isTrustedGithubApiBase("https://api.github.com/")).toBe(true);
    expect(isTrustedGithubApiBase("https://api.github.com:443/")).toBe(true);
  });

  it.each([
    undefined,
    "",
    " https://api.github.com",
    "HTTPS://API.GITHUB.COM",
    "http://api.github.com",
    "https://user:secret@api.github.com",
    "https://api.github.com:444",
    "https://api.github.com/v3",
    "https://api.github.com/.",
    "https://api.github.com/%2e",
    "https://api.github.com/%2e%2e",
    "https://api.github.com/?tenant=other",
    "https://api.github.com/#fragment",
    "https://api.github.com.evil.example",
    "not a URL",
  ])("rejects an untrusted GitHub API base: %s", (value) => {
    expect(isTrustedGithubApiBase(value)).toBe(false);
  });

  it("delegates missing and non-Bearer authorization values to the normal API path", () => {
    expect(isBoundedOidcBearer(null)).toBe(true);
    expect(isBoundedOidcBearer("Basic opaque-credential")).toBe(true);
  });

  it("accepts a compact base64url JWT envelope", () => {
    expect(isBoundedOidcBearer("Bearer eyJhbGciOiJSUzI1NiJ9.e30.signature_value-1")).toBe(true);
  });

  it.each([
    ["wrong segment count", "Bearer one.two"],
    ["empty segment", "Bearer one..three"],
    ["invalid alphabet", "Bearer one.tw+o.three"],
    ["oversized authorization header", `Bearer ${"a".repeat(16_385)}.b.c`],
    ["oversized JWT header", `Bearer ${"a".repeat(2_049)}.b.c`],
    ["oversized JWT payload", `Bearer a.${"b".repeat(8_193)}.c`],
    ["oversized JWT signature", `Bearer a.b.${"c".repeat(4_097)}`],
  ])("rejects a %s before JWT decoding", (_label, value) => {
    expect(isBoundedOidcBearer(value)).toBe(false);
  });

  it("rejects an oversized bearer before egress policy installation or credential use", async () => {
    const rejectedToken = `${"a".repeat(2_049)}.e30.signature`;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${rejectedToken}`,
          "x-request-id": "jwt-envelope-test",
        },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("jwt-envelope-test");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: {
        policy: "bounded-oidc-jwt-envelope",
        authorization_header_limit_bytes: "16384",
        jwt_header_segment_limit_bytes: "2048",
        jwt_payload_segment_limit_bytes: "8192",
        jwt_signature_segment_limit_bytes: "4096",
      },
      trace_id: "jwt-envelope-test",
    });
    expect(globalThis.fetch).toBe(nativeFetch);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"event":"oidc_token_envelope"'));
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain(rejectedToken);
  });

  it("keeps the bounded-token response available when the log sink fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { authorization: "Bearer one..three" },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      details: { policy: "bounded-oidc-jwt-envelope" },
    });
  });

  it("fails closed before the exchange pipeline can use credentials", async () => {
    const rawBase = "https://api.github.com.evil.example/collect";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "x-request-id": "egress-policy-test" },
      }),
      { GITHUB_API_BASE: rawBase, GITHUB_APP_ID: "123456" } as Env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("pragma")).toBe("no-cache");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-trace-id")).toBe("egress-policy-test");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API trust configuration unavailable",
      details: {
        policy: "github-cloud-exact-origin",
      },
      trace_id: "egress-policy-test",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"outcome":"misconfigured"'));
    expect(logSpy.mock.calls.flat().join("\n")).not.toContain(rawBase);
  });

  it("fails closed when the no-redirect fetch policy cannot be installed", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    (globalThis as FetchHost).fetch = undefined;

    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "x-request-id": "redirect-policy-test" },
      }),
      { GITHUB_API_BASE: "https://api.github.com", GITHUB_APP_ID: "123456" } as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      details: {
        policy: "credential-fetch-no-redirect",
      },
      trace_id: "redirect-policy-test",
    });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('"outcome":"policy_unavailable"'));
  });

  it("keeps the fail-closed response available when the log sink fails", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {
      throw new Error("log sink unavailable");
    });
    const unsafeTrace = "trace-".padEnd(200, "x");
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "x-request-id": unsafeTrace },
      }),
      { GITHUB_API_BASE: "https://example.com" } as Env,
    );

    expect(response.status).toBe(503);
    const payload = await response.json();
    expect(payload.error_code).toBe("ERR_GITHUB_API");
    expect(payload.trace_id).not.toBe(unsafeTrace);
    expect(String(payload.trace_id)).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("leaves non-exchange health checks available during configuration repair", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/health"),
      { GITHUB_API_BASE: "https://example.com" } as Env,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { name: "noema" },
    });
    expect(globalThis.fetch).toBe(nativeFetch);
  });

  it("delegates exchange requests when both egress controls are available", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      { GITHUB_API_BASE: "https://api.github.com", GITHUB_APP_ID: "123456" } as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
    });
    expect(globalThis.fetch).not.toBe(nativeFetch);
  });
});
