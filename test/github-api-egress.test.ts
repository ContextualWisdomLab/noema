import { afterEach, describe, expect, it, vi } from "vitest";
import entrypoint, {
  isTrustedGithubApiBase,
  type Env,
} from "../src/entrypoint";

describe("GitHub API egress policy", () => {
  afterEach(() => {
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

  it("fails closed before the exchange pipeline can use credentials", async () => {
    const rawBase = "https://api.github.com.evil.example/collect";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "x-request-id": "egress-policy-test" },
      }),
      { GITHUB_API_BASE: rawBase } as Env,
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
  });

  it("delegates exchange requests when the trusted origin is configured", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      { GITHUB_API_BASE: "https://api.github.com" } as Env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
    });
  });
});
