import { describe, expect, it, vi } from "vitest";

import { NoemaOidcReplayGuard } from "../src/oidc-replay";

const CLAIM_KEY = "oidc-token-claim";

describe("OIDC replay alarm claim replacement race", () => {
  it("does not let an expired alarm delete a claim committed after the alarm transaction", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_700_000);
    const replacement = {
      expires_at_epoch_seconds: 3_200,
      first_used_at_epoch_seconds: 2_700,
    };
    const records = new Map<string, unknown>([[CLAIM_KEY, {
      expires_at_epoch_seconds: 2_600,
      first_used_at_epoch_seconds: 2_000,
    }]]);
    const rootDeleteAll = vi.fn(async () => records.clear());
    const transactionSetAlarm = vi.fn(async () => undefined);
    let injected = false;

    const storage = {
      async transaction<T>(callback: (transaction: DurableObjectTransaction) => Promise<T>): Promise<T> {
        const result = await callback({
          async get<V>(key: string): Promise<V | undefined> {
            return records.get(key) as V | undefined;
          },
          async delete(key: string): Promise<boolean> {
            return records.delete(key);
          },
          setAlarm: transactionSetAlarm,
        } as unknown as DurableObjectTransaction);

        if (!injected) {
          records.set(CLAIM_KEY, replacement);
          injected = true;
        }
        return result;
      },
      setAlarm: vi.fn(async () => undefined),
      deleteAll: rootDeleteAll,
    } as unknown as DurableObjectStorage;

    const guard = new NoemaOidcReplayGuard({ storage } as unknown as DurableObjectState);

    await guard.alarm();

    expect(records.get(CLAIM_KEY)).toEqual(replacement);
    expect(rootDeleteAll).not.toHaveBeenCalled();
  });
});
