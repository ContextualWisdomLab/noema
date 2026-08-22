import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function claimRequest(expiresAtEpochSeconds: number): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
  });
}

function corruptStorage(claim: {
  first_used_at_epoch_seconds: number;
  expires_at_epoch_seconds: number;
}) {
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
          return claim as V;
        },
        put,
      });
    },
    setAlarm,
    deleteAll,
  };
  return { storage, put, setAlarm, deleteAll };
}

describe("OIDC replay persisted lifetime integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when persisted replay state exceeds the accepted token lifetime", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_000,
      expires_at_epoch_seconds: 4_601,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    const response = await guard.fetch(claimRequest(1_500));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.put).not.toHaveBeenCalled();
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("deletes overlong persisted replay state instead of scheduling from its expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_000,
      expires_at_epoch_seconds: 4_601,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("fails closed when persisted first-use time is later than the current clock", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_001,
      expires_at_epoch_seconds: 1_500,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    const response = await guard.fetch(claimRequest(1_500));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.put).not.toHaveBeenCalled();
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("deletes a future-first-use replay record instead of scheduling from its expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_001,
      expires_at_epoch_seconds: 1_500,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("fails closed when persisted replay state has a zero-second lifetime", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_000,
      expires_at_epoch_seconds: 1_000,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    const response = await guard.fetch(claimRequest(1_500));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: "invalid_state" });
    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.put).not.toHaveBeenCalled();
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("deletes zero-second persisted replay state instead of treating it as a valid expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = corruptStorage({
      first_used_at_epoch_seconds: 1_000,
      expires_at_epoch_seconds: 1_000,
    });
    const guard = new NoemaOidcReplayGuard({ storage: fake.storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(fake.deleteAll).toHaveBeenCalledTimes(1);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });
});
