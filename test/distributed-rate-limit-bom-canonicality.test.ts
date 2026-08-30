import { describe, expect, it, vi } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  NoemaRateLimiter,
} from "../src/rate-limit";

function bomPrefixedJson(value: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(json.byteLength + 3);
  bytes.set([0xef, 0xbb, 0xbf], 0);
  bytes.set(json, 3);
  return bytes;
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
      setAlarm(timestamp: number): Promise<void>;
    }) => Promise<T>): Promise<T> {
      return callback({
        async get<V>(key: string): Promise<V | undefined> {
          return records.get(key) as V | undefined;
        },
        async put<V>(key: string, value: V): Promise<void> {
          records.set(key, value);
        },
        setAlarm,
      });
    },
    setAlarm,
    deleteAll,
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    records,
    setAlarm,
  };
}

describe("distributed rate-limit JSON byte canonicality", () => {
  it("rejects a UTF-8 BOM-prefixed internal request before mutating limiter state", async () => {
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);
    const response = await limiter.fetch(new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bomPrefixedJson({ limit: 1 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(fake.records.size).toBe(0);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("fails closed when the Durable Object decision starts with a UTF-8 BOM", async () => {
    const namespace = {
      idFromName() {
        return { toString: () => "exchange:test" } as DurableObjectId;
      },
      get() {
        return {
          fetch: async () => new Response(bomPrefixedJson({
            allowed: true,
            limit: 60,
            remaining: 59,
            retry_after_seconds: 0,
          }), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        } as unknown as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace;

    const decision = checkDistributedRateLimit(
      new Request("https://noema.example/exchange", {
        headers: { "cf-connecting-ip": "203.0.113.50" },
      }),
      {
        NOEMA_RATE_LIMIT_PER_MINUTE: "60",
        NOEMA_RATE_LIMITER: namespace,
      },
    );

    await expect(decision).rejects.toBeInstanceOf(DistributedRateLimitUnavailable);
  });
});
