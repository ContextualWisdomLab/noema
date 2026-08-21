import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

function limiterRequest(limit = 1): Request {
  return new Request("https://noema-rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
}

const corruptStoredBuckets: unknown[] = [
  null,
  "corrupt",
  { window_start_ms: 1.5, count: 0 },
  { window_start_ms: -1, count: 0 },
  { window_start_ms: Number.MAX_SAFE_INTEGER + 1, count: 0 },
  { window_start_ms: 1_000_000, count: 1.5 },
  { window_start_ms: 1_000_000, count: -1 },
  { window_start_ms: 1_000_000, count: 10_001 },
  { window_start_ms: 1_000_000, count: Number.MAX_SAFE_INTEGER + 1 },
];

describe("distributed rate-limit stored-state integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(corruptStoredBuckets)(
    "fails closed instead of deriving capacity from corrupt persisted bucket %#",
    async (storedBucket) => {
      vi.spyOn(Date, "now").mockReturnValue(1_000_001);
      const put = vi.fn(async () => undefined);
      const setAlarm = vi.fn(async () => undefined);
      const storage = {
        async transaction<T>(callback: (transaction: {
          get<V>(key: string): Promise<V | undefined>;
          put<V>(key: string, value: V): Promise<void>;
        }) => Promise<T>): Promise<T> {
          return callback({
            async get<V>(): Promise<V | undefined> {
              return storedBucket as V;
            },
            put,
          });
        },
        setAlarm,
      };
      const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

      const response = await limiter.fetch(limiterRequest());

      expect(response.status).toBe(500);
      await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
      expect(put).not.toHaveBeenCalled();
      expect(setAlarm).not.toHaveBeenCalled();
    },
  );

  it("deletes corrupt future bucket state instead of scheduling an untrusted alarm", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_001);
    const setAlarm = vi.fn(async () => undefined);
    const deleteAll = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              window_start_ms: Number.MAX_SAFE_INTEGER + 1,
              count: 0,
            } as V;
          },
        });
      },
      setAlarm,
      deleteAll,
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    await limiter.alarm();

    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(setAlarm).not.toHaveBeenCalled();
  });
});
