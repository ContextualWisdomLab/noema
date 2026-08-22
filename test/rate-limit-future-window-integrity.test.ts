import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

function limiterRequest(limit = 2): Request {
  return new Request("https://noema-rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
}

describe("distributed rate-limit future-window integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed and clears storage when persisted bucket time is later than the current clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const put = vi.fn(async () => undefined);
    const setAlarm = vi.fn(async () => undefined);
    const deleteAll = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              window_start_ms: 1_000_001,
              count: 1,
            } as V;
          },
          put,
        });
      },
      setAlarm,
      deleteAll,
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    const response = await limiter.fetch(limiterRequest());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(put).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
  });

  it("deletes a future-window bucket instead of scheduling cleanup from an untrusted time", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const setAlarm = vi.fn(async () => undefined);
    const deleteAll = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              window_start_ms: 1_000_001,
              count: 1,
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