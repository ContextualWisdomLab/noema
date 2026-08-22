import { describe, expect, it, vi } from "vitest";

import { NoemaOidcReplayGuard } from "../src/oidc-replay";

const CLAIM_KEY = "oidc-token-claim";

describe("OIDC replay alarm claim replacement race", () => {
  it("does nothing when the alarm observes no persisted replay claim", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_700_000);
    const rootDeleteAll = vi.fn(async () => undefined);
    const rootSetAlarm = vi.fn(async () => undefined);
    const transaction = vi.fn(async <T>(callback: (transaction: DurableObjectTransaction) => Promise<T>) => callback({
      async get<V>(): Promise<V | undefined> {
        return undefined;
      },
    } as unknown as DurableObjectTransaction));
    const storage = {
      transaction,
      setAlarm: rootSetAlarm,
      deleteAll: rootDeleteAll,
    } as unknown as DurableObjectStorage;
    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(transaction).toHaveBeenCalledOnce();
    expect(rootDeleteAll).not.toHaveBeenCalled();
    expect(rootSetAlarm).not.toHaveBeenCalled();
  });

  it("fully deallocates expired storage inside the transaction without deleting a later claim", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_700_000);
    const replacement = {
      expires_at_epoch_seconds: 3_200,
      first_used_at_epoch_seconds: 2_700,
    };
    const records = new Map<string, unknown>([[CLAIM_KEY, {
      expires_at_epoch_seconds: 2_600,
      first_used_at_epoch_seconds: 2_000,
    }]]);
    let inTransaction = false;
    let injected = false;
    const transactionDelete = vi.fn(async (key: string) => records.delete(key));
    const rootDeleteAll = vi.fn(async () => {
      expect(inTransaction).toBe(true);
      records.clear();
    });

    const storage = {
      async transaction<T>(callback: (transaction: DurableObjectTransaction) => Promise<T>): Promise<T> {
        inTransaction = true;
        try {
          const result = await callback({
            async get<V>(key: string): Promise<V | undefined> {
              return records.get(key) as V | undefined;
            },
            delete: transactionDelete,
          } as unknown as DurableObjectTransaction);
          return result;
        } finally {
          inTransaction = false;
          if (!injected) {
            records.set(CLAIM_KEY, replacement);
            injected = true;
          }
        }
      },
      setAlarm: vi.fn(async () => undefined),
      deleteAll: rootDeleteAll,
    } as unknown as DurableObjectStorage;

    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(rootDeleteAll).toHaveBeenCalledOnce();
    expect(transactionDelete).not.toHaveBeenCalled();
    expect(records.get(CLAIM_KEY)).toEqual(replacement);
  });
});
