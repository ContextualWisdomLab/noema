import { describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

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
    deleteAll,
  };
}

function limiterRequest(url: string): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit: 60 }),
  });
}

describe("distributed rate-limit internal endpoint authority", () => {
  it.each([
    ["foreign origin", "https://attacker.example/check"],
    ["unreviewed query", "https://noema-rate-limit.internal/check?scope=other"],
    ["unreviewed fragment", "https://noema-rate-limit.internal/check#other"],
  ])("rejects %s without mutating limiter state", async (_label, url) => {
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);

    const response = await limiter.fetch(limiterRequest(url));

    expect(response.status).toBe(404);
    expect(fake.records.size).toBe(0);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("preserves the exact canonical internal check endpoint", async () => {
    const fake = fakeDurableObjectState();
    const limiter = new NoemaRateLimiter(fake.state);

    const response = await limiter.fetch(
      limiterRequest("https://noema-rate-limit.internal/check"),
    );

    expect(response.status).toBe(200);
    expect(fake.records.size).toBe(1);
    expect(fake.setAlarm).toHaveBeenCalledOnce();
  });
});
