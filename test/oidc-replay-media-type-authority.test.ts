import { describe, expect, it, vi } from "vitest";
import {
  claimOidcTokenUsage,
  NoemaOidcReplayGuard,
  OidcReplayUnavailable,
} from "../src/oidc-replay";

function namespaceReturning(response: Response): DurableObjectNamespace {
  return {
    idFromName() {
      return { toString: () => "oidc-replay-test" } as DurableObjectId;
    },
    get() {
      return {
        fetch: vi.fn(async () => response),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function fakeDurableObjectState() {
  const records = new Map<string, unknown>();
  const setAlarm = vi.fn(async () => undefined);
  const deleteAll = vi.fn(async () => records.clear());
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
  };
}

describe("OIDC replay JSON media authority", () => {
  it.each([
    "application/json; charset=iso-8859-1",
    "application/json; profile=unreviewed",
    "application/json; charset=utf-8; profile=unreviewed",
  ])("rejects replay decisions with unreviewed media parameters: %s", async (contentType) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const expiresAt = 1_100;
    const response = new Response(JSON.stringify({
      accepted: true,
      expires_at_epoch_seconds: expiresAt,
    }), {
      status: 201,
      headers: { "content-type": contentType },
    });

    await expect(claimOidcTokenUsage("replay-media-test", expiresAt, {
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response),
    })).rejects.toBeInstanceOf(OidcReplayUnavailable);
  });

  it("accepts the one reviewed UTF-8 charset declaration for replay decisions", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const expiresAt = 1_100;
    const response = new Response(JSON.stringify({
      accepted: true,
      expires_at_epoch_seconds: expiresAt,
    }), {
      status: 201,
      headers: { "content-type": "application/json; charset=utf-8" },
    });

    await expect(claimOidcTokenUsage("replay-media-test", expiresAt, {
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response),
    })).resolves.toEqual({
      accepted: true,
      expires_at_epoch_seconds: expiresAt,
    });
  });

  it("rejects unreviewed request media parameters before mutating replay state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = fakeDurableObjectState();
    const guard = new NoemaOidcReplayGuard(fake.state);
    const response = await guard.fetch(new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json; charset=iso-8859-1" },
      body: JSON.stringify({ expires_at_epoch_seconds: 1_100 }),
    }));

    expect(response.status).toBe(415);
    expect(fake.records.size).toBe(0);
  });
});
