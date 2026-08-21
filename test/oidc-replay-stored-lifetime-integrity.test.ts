import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function claimRequest(expiresAtEpochSeconds: number): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
  });
}

describe("OIDC replay persisted lifetime integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when persisted replay state exceeds the accepted token lifetime", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const put = vi.fn(async () => undefined);
    const setAlarm = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              first_used_at_epoch_seconds: 1_000,
              expires_at_epoch_seconds: 4_601,
            } as V;
          },
          put,
        });
      },
      setAlarm,
    };
    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    const response = await guard.fetch(claimRequest(1_500));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(put).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
  });

  it("deletes overlong persisted replay state instead of scheduling from its expiry", async () => {
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
              first_used_at_epoch_seconds: 1_000,
              expires_at_epoch_seconds: 4_601,
            } as V;
          },
        });
      },
      setAlarm,
      deleteAll,
    };
    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(setAlarm).not.toHaveBeenCalled();
  });

  it("fails closed when persisted first-use time is later than the current clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const put = vi.fn(async () => undefined);
    const setAlarm = vi.fn(async () => undefined);
    const storage = {
      async transaction<T>(callback: (transaction: {
        get<V>(key: string): Promise<V | undefined>;
        put<V>(key: string, value: V): Promise<void>;
      }) => Promise<T>): Promise<T> {
        return callback({
          async get<V>(): Promise<V | undefined> {
            return {
              first_used_at_epoch_seconds: 1_001,
              expires_at_epoch_seconds: 1_500,
            } as V;
          },
          put,
        });
      },
      setAlarm,
    };
    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    const response = await guard.fetch(claimRequest(1_500));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(put).not.toHaveBeenCalled();
    expect(setAlarm).not.toHaveBeenCalled();
  });

  it("deletes a future-first-use replay record instead of scheduling from its expiry", async () => {
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
              first_used_at_epoch_seconds: 1_001,
              expires_at_epoch_seconds: 1_500,
            } as V;
          },
        });
      },
      setAlarm,
      deleteAll,
    };
    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(deleteAll).toHaveBeenCalledTimes(1);
    expect(setAlarm).not.toHaveBeenCalled();
  });
});
