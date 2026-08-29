import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1",
};

function exchangeRequest(clientIp: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { "cf-connecting-ip": clientIp },
  });
}

describe("local rate-limit bucket capacity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("bounds active process-local defense-in-depth buckets instead of retaining unbounded client identities", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const { default: worker } = await import("../src/index");

    const oldestClient = "10.255.255.254";
    expect((await worker.fetch(exchangeRequest(oldestClient), env)).status).toBe(401);

    for (let index = 0; index < 10_000; index += 1) {
      const clientIp = `10.0.${Math.floor(index / 256)}.${index % 256}`;
      const response = await worker.fetch(exchangeRequest(clientIp), env);
      expect(response.status).toBe(401);
    }

    // Once 10,000 active identities are retained, the oldest defense-in-depth
    // bucket must be evicted before accepting another identity. The distributed
    // Durable Object limiter remains the production authority, while this local
    // layer stays memory-bounded rather than growing with attacker-controlled
    // trusted client cardinality.
    expect((await worker.fetch(exchangeRequest(oldestClient), env)).status).toBe(401);
  }, 30_000);

  it("drops expired identities before capacity eviction while preserving the current bucket", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const { default: worker } = await import("../src/index");

    for (let index = 0; index < 10_000; index += 1) {
      const clientIp = `10.1.${Math.floor(index / 256)}.${index % 256}`;
      expect((await worker.fetch(exchangeRequest(clientIp), env)).status).toBe(401);
    }

    now.mockReturnValue(1_800_000_060_001);
    const currentClient = "10.254.254.254";
    expect((await worker.fetch(exchangeRequest(currentClient), env)).status).toBe(401);
    expect((await worker.fetch(exchangeRequest(currentClient), env)).status).toBe(429);

    // The old identity is accepted as a fresh bucket after the stale population
    // is discarded, while the current-window bucket above remains rate-limited.
    expect((await worker.fetch(exchangeRequest("10.1.0.0"), env)).status).toBe(401);
  }, 30_000);

  it("keeps a renewed oldest bucket current when the next identity triggers capacity eviction", async () => {
    vi.resetModules();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const now = vi.spyOn(Date, "now").mockReturnValue(1_800_000_000_000);
    const { default: worker } = await import("../src/index");

    const renewedClient = "10.2.255.254";
    expect((await worker.fetch(exchangeRequest(renewedClient), env)).status).toBe(401);

    now.mockReturnValue(1_800_000_030_000);
    for (let index = 0; index < 9_999; index += 1) {
      const clientIp = `10.3.${Math.floor(index / 256)}.${index % 256}`;
      expect((await worker.fetch(exchangeRequest(clientIp), env)).status).toBe(401);
    }

    // Only the oldest identity has expired. Renewing it must refresh both its
    // rate-limit window and its eviction recency; otherwise the next new client
    // evicts the just-renewed bucket and grants that client a fresh local window.
    now.mockReturnValue(1_800_000_060_001);
    expect((await worker.fetch(exchangeRequest(renewedClient), env)).status).toBe(401);
    expect((await worker.fetch(exchangeRequest("10.254.254.253"), env)).status).toBe(401);
    expect((await worker.fetch(exchangeRequest(renewedClient), env)).status).toBe(429);
  }, 30_000);
});
