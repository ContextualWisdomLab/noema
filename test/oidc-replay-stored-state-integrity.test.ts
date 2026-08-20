import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function claimRequest(expiresAtEpochSeconds: number): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
  });
}

const corruptStoredClaims: unknown[] = [
  null,
  "corrupt",
  {},
  { expires_at_epoch_seconds: Number.NaN, first_used_at_epoch_seconds: 1_000 },
  { expires_at_epoch_seconds: 1_500, first_used_at_epoch_seconds: -1 },
  { expires_at_epoch_seconds: 1_500, first_used_at_epoch_seconds: 1.5 },
  { expires_at_epoch_seconds: 1_500, first_used_at_epoch_seconds: 1_501 },
  { expires_at_epoch_seconds: Number.MAX_SAFE_INTEGER + 1, first_used_at_epoch_seconds: 1_000 },
];

describe("OIDC replay persisted-state integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(corruptStoredClaims)(
    "fails closed instead of replacing corrupt replay state %#",
    async (storedClaim) => {
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
              return storedClaim as V;
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
    },
  );
});
