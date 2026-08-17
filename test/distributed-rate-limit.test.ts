import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";
import {
  configuredDistributedRateLimit,
  DistributedRateLimitUnavailable,
  distributedRateLimitObjectName,
  NoemaRateLimiter,
  trustedClientIdentifier,
} from "../src/rate-limit";

const baseEnv = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "60",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function oidcTokenWithWorkflowRef(workflowRef: string): string {
  return [
    encodeSegment({ alg: "RS256", kid: "workflow-trust-test" }),
    encodeSegment({ job_workflow_ref: workflowRef }),
    "signature",
  ].join(".");
}

function namespaceReturning(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  observedNames: string[] = [],
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      observedNames.push(name);
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return { fetch: handler } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function envWith(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  observedNames: string[] = [],
): Env {
  return {
    ...baseEnv,
    NOEMA_RATE_LIMITER: namespaceReturning(handler, observedNames),
  };
}

function decisionResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    allowed: true,
    limit: 60,
    remaining: 59,
    retry_after_seconds: 0,
    ...overrides,
  });
}

function fakeDurableObjectState() {
  const records = new Map<string, unknown>();
  const setAlarm = vi.fn(async () => undefined);
  const deleteAll = vi.fn(async () => {
    records.clear();
  });
  const storage = {
    async transaction<T>(callback: (transaction: {
      get<V>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
    }) => Promise<T>): Promise<T> {
      return callback({
        async get<V>(key: string): Promise<V | undefined> {
          return records.get(key) as V | undefined;
        },
        async put<V>(key: string, value: V): Promise<void> {
          records.set(key, value);
        },
      });
    },
    setAlarm,
    deleteAll,
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    records,
    setAlarm,
    deleteAll,
  };
}

describe("distributed exchange rate limit", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not invoke the Durable Object for health checks", async () => {
    const handler = vi.fn(async () => decisionResponse());
    const response = await worker.fetch(
      new Request("https://noema.example/health"),
      envWith(handler),
    );

    expect(response.status).toBe(200);
    expect(handler).not.toHaveBeenCalled();
  });

  it("checks the distributed limiter before delegating exchange authentication", async () => {
    const handler = vi.fn(async () => decisionResponse());
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.10" },
      }),
      envWith(handler),
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);
    expect(response.headers.get("x-rate-limit-limit")).toBe("60");
    expect(response.headers.get("x-rate-limit-remaining")).toBe("59");
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
  });

  it("rejects workflow refs that only share the trusted prefix", async () => {
    const handler = vi.fn(async () => decisionResponse());
    const externalFetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new Error("OIDC verification must not run for a prefix-sharing workflow ref"),
    );
    const token = oidcTokenWithWorkflowRef(
      `${baseEnv.ALLOWED_WORKFLOW_REF_PREFIX}-attacker`,
    );

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "cf-connecting-ip": "203.0.113.14",
        },
      }),
      envWith(handler),
    );

    expect(handler).toHaveBeenCalledOnce();
    expect(externalFetch).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-rate-limit-limit")).toBe("60");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow_ref is not allowed",
      details: {
        match_policy: "exact",
        hint: expect.stringContaining("prefix-sharing refs are rejected"),
      },
    });
  });

  it("fails closed when the exact workflow trust configuration is ambiguous", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.15" },
      }),
      {
        ...envWith(async () => decisionResponse()),
        ALLOWED_WORKFLOW_REF_PREFIX: `${baseEnv.ALLOWED_WORKFLOW_REF_PREFIX}*`,
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
      details: {
        match_policy: "exact",
      },
    });
  });

  it("returns a standard no-store 429 without reaching the token exchange", async () => {
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.11",
          authorization: "Bearer should-not-be-parsed",
        },
      }),
      envWith(async () => decisionResponse({
        allowed: false,
        remaining: 0,
        retry_after_seconds: 37,
      })),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      details: {
        retry_after_seconds: "37",
        scope: "distributed",
      },
    });
  });

  it("fails closed when the distributed decision service is unavailable", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.12" },
      }),
      envWith(async () => {
        throw new Error("binding unavailable");
      }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      message: "Distributed rate limiter unavailable",
      details: { scope: "distributed" },
    });
  });

  it("fails closed before object lookup without a valid Cloudflare client IP", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const handler = vi.fn(async () => decisionResponse());
    const observedNames: string[] = [];
    const runtimeEnv = envWith(handler, observedNames);
    const clientHeaders = [
      {},
      { "cf-connecting-ip": "not an ip" },
      { "cf-connecting-ip": "256.1.1.1" },
      { "cf-connecting-ip": "01.2.3.4" },
      { "cf-connecting-ip": "203.0.113.1, 198.51.100.1" },
      { "cf-connecting-ip": "1::2::3" },
      { "cf-connecting-ip": "2".repeat(129) },
    ];

    for (const headers of clientHeaders) {
      const response = await worker.fetch(
        new Request("https://noema.example/exchange", {
          method: "POST",
          headers,
        }),
        runtimeEnv,
      );

      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("1");
      expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_RATE_LIMIT",
        message: "Distributed rate limiter unavailable",
      });
    }
    expect(observedNames).toEqual([]);
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects malformed decision payloads instead of failing open", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.13" },
      }),
      envWith(async () => Response.json({ allowed: true })),
    );

    expect(response.status).toBe(503);
  });

  it("uses only a canonical Cloudflare client IP for bucket identity", async () => {
    const first = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": "2001:db8::10",
        "x-forwarded-for": "198.51.100.1",
      },
    });
    const equivalentIpv6 = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": "2001:0DB8:0000:0000:0000:0000:0000:0010",
        "x-forwarded-for": "198.51.100.222",
      },
    });
    const spoofedOnly = new Request("https://noema.example/exchange", {
      headers: { "x-forwarded-for": "198.51.100.1" },
    });
    const mappedIpv6 = new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": "::ffff:192.0.2.128" },
    });

    expect(trustedClientIdentifier(first)).toBe("2001:db8::10");
    expect(trustedClientIdentifier(equivalentIpv6)).toBe("2001:db8::10");
    expect(trustedClientIdentifier(mappedIpv6)).toBe("::ffff:c000:280");
    expect(await distributedRateLimitObjectName(first)).toBe(
      await distributedRateLimitObjectName(equivalentIpv6),
    );
    expect(trustedClientIdentifier(spoofedOnly)).toBeUndefined();
    await expect(distributedRateLimitObjectName(spoofedOnly)).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailable,
    );
  });

  it("accepts strict canonical IPv4 and rejects ambiguous address forms", () => {
    const requestWith = (value: string) => new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": value },
    });

    expect(trustedClientIdentifier(requestWith("203.0.113.10"))).toBe("203.0.113.10");
    expect(trustedClientIdentifier(requestWith("203.0.113"))).toBeUndefined();
    expect(trustedClientIdentifier(requestWith("203.0.113.010"))).toBeUndefined();
    expect(trustedClientIdentifier(requestWith("203.0.113.-1"))).toBeUndefined();
    expect(trustedClientIdentifier(requestWith("[2001:db8::1]"))).toBeUndefined();
    expect(trustedClientIdentifier(requestWith("fe80::1%eth0"))).toBeUndefined();
  });

  it("bounds invalid configuration to a safe default or maximum", () => {
    expect(configuredDistributedRateLimit(undefined)).toBe(60);
    expect(configuredDistributedRateLimit("not-a-number")).toBe(60);
    expect(configuredDistributedRateLimit("-1")).toBe(60);
    expect(configuredDistributedRateLimit("1.9")).toBe(1);
    expect(configuredDistributedRateLimit("999999")).toBe(10_000);
  });

  it("persists one fixed-window decision across Durable Object instances", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = fakeDurableObjectState();
    const request = () => new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 1 }),
    });

    const firstInstance = new NoemaRateLimiter(fake.state);
    const first = await firstInstance.fetch(request());
    expect(first.status).toBe(200);
    await expect(first.json()).resolves.toMatchObject({
      allowed: true,
      limit: 1,
      remaining: 0,
      retry_after_seconds: 0,
    });
    expect(fake.setAlarm).toHaveBeenCalledWith(1_060_000);

    const restartedInstance = new NoemaRateLimiter(fake.state);
    const second = await restartedInstance.fetch(request());
    expect(second.status).toBe(200);
    await expect(second.json()).resolves.toMatchObject({
      allowed: false,
      limit: 1,
      remaining: 0,
      retry_after_seconds: 60,
    });
  });

  it("clears expired bucket storage through the Durable Object alarm", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    });

    await limiter.fetch(request);
    expect(fake.records.size).toBe(1);
    now.mockReturnValue(2_060_000);
    await limiter.alarm();
    expect(fake.deleteAll).toHaveBeenCalledOnce();
    expect(fake.records.size).toBe(0);
  });

  it("reschedules a delayed alarm instead of deleting a renewed active window", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);
    const request = () => new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 5 }),
    });

    await limiter.fetch(request());
    now.mockReturnValue(3_060_001);
    await limiter.fetch(request());
    now.mockReturnValue(3_060_002);
    await limiter.alarm();

    expect(fake.deleteAll).not.toHaveBeenCalled();
    expect(fake.records.size).toBe(1);
    expect(fake.setAlarm).toHaveBeenLastCalledWith(3_120_001);
  });

  it("deallocates empty Durable Object storage when an alarm has no bucket", async () => {
    vi.spyOn(Date, "now").mockReturnValue(4_000_000);
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);

    await limiter.alarm();

    expect(fake.deleteAll).toHaveBeenCalledOnce();
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("rejects malformed internal limiter requests", async () => {
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);

    expect((await limiter.fetch(new Request("https://internal/check"))).status).toBe(404);
    expect((await limiter.fetch(new Request("https://internal/check", {
      method: "POST",
      body: "{}",
    }))).status).toBe(415);
    expect((await limiter.fetch(new Request("https://internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 0 }),
    }))).status).toBe(400);
  });
});

describe("distributed rate limit fail-closed edges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when the limiter returns a non-object decision", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.20" },
      }),
      envWith(async () => Response.json(null)),
    );

    expect(response.status).toBe(503);
  });

  it("fails closed when the limiter Durable Object returns a non-2xx status", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.21" },
      }),
      envWith(async () => Response.json({ error: "boom" }, { status: 500 })),
    );

    expect(response.status).toBe(503);
  });

  it("wraps a non-Error thrown by the limiter Durable Object", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.22" },
      }),
      envWith(async () => {
        throw "opaque limiter failure";
      }),
    );

    expect(response.status).toBe(503);
  });

  it("rejects a non-object limiter payload", async () => {
    const limiter = new NoemaRateLimiter(fakeDurableObjectState().state);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(123),
    }));

    expect(response.status).toBe(400);
  });

  it("rejects a non-integer limiter value", async () => {
    const limiter = new NoemaRateLimiter(fakeDurableObjectState().state);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 2.5 }),
    }));

    expect(response.status).toBe(400);
  });

  it("rejects malformed limiter JSON", async () => {
    const limiter = new NoemaRateLimiter(fakeDurableObjectState().state);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }));

    expect(response.status).toBe(400);
  });

  it("rejects a limiter request without a JSON content type", async () => {
    const limiter = new NoemaRateLimiter(fakeDurableObjectState().state);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
    }));

    expect(response.status).toBe(415);
  });
});
