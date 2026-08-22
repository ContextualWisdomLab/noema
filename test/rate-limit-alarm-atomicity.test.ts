import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaRateLimiter } from "../src/rate-limit";

function limiterRequest(limit = 1): Request {
  return new Request("https://noema-rate-limit.internal/check", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ limit }),
  });
}

describe("distributed rate-limit alarm atomicity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a new-window alarm through SQLite storage while the bucket transaction is open", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    let inTransaction = false;
    const topLevelSetAlarm = vi.fn(async () => {
      expect(inTransaction).toBe(true);
    });
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        inTransaction = true;
        try {
          return await callback({
            async get<V>(): Promise<V | undefined> {
              return undefined;
            },
            async put<V>(): Promise<void> {
              expect(inTransaction).toBe(true);
            },
          });
        } finally {
          inTransaction = false;
        }
      },
      setAlarm: topLevelSetAlarm,
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    const response = await limiter.fetch(limiterRequest());

    expect(response.status).toBe(200);
    expect(topLevelSetAlarm).toHaveBeenCalledWith(1_060_000);
  });

  it("increments an active window without replacing its existing alarm", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const topLevelSetAlarm = vi.fn(async () => undefined);
    const put = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              window_start_ms: 990_000,
              count: 1,
            } as V;
          },
          put,
        });
      },
      setAlarm: topLevelSetAlarm,
      deleteAll: vi.fn(async () => undefined),
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    const response = await limiter.fetch(limiterRequest(3));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      allowed: true,
      limit: 3,
      remaining: 1,
      retry_after_seconds: 0,
    });
    expect(put).toHaveBeenCalledWith("bucket", {
      window_start_ms: 990_000,
      count: 2,
    });
    expect(topLevelSetAlarm).not.toHaveBeenCalled();
  });

  it("deletes expired bucket state before the observing transaction can release", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    let inTransaction = false;
    const deleteAll = vi.fn(async () => {
      expect(inTransaction).toBe(true);
    });
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
      }) => Promise<T>): Promise<T> {
        inTransaction = true;
        try {
          return await callback({
            async get<V>(): Promise<V | undefined> {
              return {
                window_start_ms: 1_900_000,
                count: 1,
              } as V;
            },
          });
        } finally {
          inTransaction = false;
        }
      },
      deleteAll,
      setAlarm: vi.fn(async () => undefined),
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    await limiter.alarm();

    expect(deleteAll).toHaveBeenCalledOnce();
  });

  it("reschedules a live bucket alarm through SQLite storage while the observing transaction is open", async () => {
    vi.spyOn(Date, "now").mockReturnValue(3_000_000);
    let inTransaction = false;
    const topLevelSetAlarm = vi.fn(async () => {
      expect(inTransaction).toBe(true);
    });
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
      }) => Promise<T>): Promise<T> {
        inTransaction = true;
        try {
          return await callback({
            async get<V>(): Promise<V | undefined> {
              return {
                window_start_ms: 2_970_000,
                count: 1,
              } as V;
            },
          });
        } finally {
          inTransaction = false;
        }
      },
      setAlarm: topLevelSetAlarm,
      deleteAll: vi.fn(async () => undefined),
    };
    const limiter = new NoemaRateLimiter({ storage } as unknown as DurableObjectState);

    await limiter.alarm();

    expect(topLevelSetAlarm).toHaveBeenCalledWith(3_030_000);
  });
});