import { describe, expect, it } from "vitest";
import {
  checkDistributedRateLimit,
  NoemaRateLimiter,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

function durableObjectState(): DurableObjectState {
  const records = new Map<string, unknown>();
  const storage = {
    async transaction<T>(callback: (transaction: {
      get<V>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
      setAlarm(timestamp: number): Promise<void>;
    }) => Promise<T>): Promise<T> {
      return callback({
        async get<V>(key: string): Promise<V | undefined> {
          return records.get(key) as V | undefined;
        },
        async put<V>(key: string, value: V): Promise<void> {
          records.set(key, value);
        },
        async setAlarm(): Promise<void> {},
      });
    },
    async deleteAll(): Promise<void> {
      records.clear();
    },
  };
  return { storage } as unknown as DurableObjectState;
}

function envReturning(response: Response): DistributedRateLimitEnv {
  const namespace = {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch(): Promise<Response> {
          return response;
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return {
    NOEMA_RATE_LIMIT_PER_MINUTE: "60",
    NOEMA_RATE_LIMITER: namespace,
  };
}

describe("distributed rate-limit reader lifecycle", () => {
  it("releases the internal request body after a successful decision", async () => {
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 60 }),
    });
    const limiter = new NoemaRateLimiter(durableObjectState());

    expect(request.body?.locked).toBe(false);
    expect((await limiter.fetch(request)).status).toBe(200);
    expect(request.body?.locked).toBe(false);
  });

  it("releases the Durable Object decision body after successful validation", async () => {
    const decision = Response.json({
      allowed: true,
      limit: 60,
      remaining: 59,
      retry_after_seconds: 0,
    });
    const request = new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": "203.0.113.40" },
    });

    expect(decision.body?.locked).toBe(false);
    await expect(checkDistributedRateLimit(request, envReturning(decision))).resolves.toMatchObject({
      allowed: true,
      limit: 60,
      remaining: 59,
      retry_after_seconds: 0,
    });
    expect(decision.body?.locked).toBe(false);
  });
});
