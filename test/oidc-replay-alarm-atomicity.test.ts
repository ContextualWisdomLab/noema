import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function rollbackCapableState() {
  const records = new Map<string, unknown>();
  const setAlarm = vi.fn(async () => {
    throw new Error("synthetic alarm persistence failure");
  });
  const storage = {
    async transaction<T>(callback: (transaction: {
      get<V>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
    }) => Promise<T>): Promise<T> {
      const before = new Map(records);
      try {
        return await callback({
          async get<V>(key: string): Promise<V | undefined> {
            return records.get(key) as V | undefined;
          },
          async put<V>(key: string, value: V): Promise<void> {
            records.set(key, value);
          },
        });
      } catch (error) {
        records.clear();
        for (const [key, value] of before) records.set(key, value);
        throw error;
      }
    },
    setAlarm,
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    records,
    setAlarm,
  };
}

function claimRequest(expiresAtEpochSeconds: number): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
  });
}

describe("OIDC replay claim retention atomicity", () => {
  it("does not strand a consumed-token record when initial alarm persistence fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = rollbackCapableState();
    const guard = new NoemaOidcReplayGuard(fake.state);

    await expect(guard.fetch(claimRequest(2_600))).rejects.toThrow(
      "synthetic alarm persistence failure",
    );

    expect(fake.setAlarm).toHaveBeenCalledWith(2_630_000);
    expect(fake.records.size).toBe(0);
  });
});
