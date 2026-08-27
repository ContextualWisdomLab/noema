import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimOidcTokenUsage,
  NoemaOidcReplayGuard,
  OidcReplayUnavailable,
} from "../src/oidc-replay";

function namespaceReturning(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return { fetch: handler } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function fakeDurableObjectState() {
  const records = new Map<string, unknown>();
  const setAlarm = vi.fn(async () => undefined);
  const deleteAll = vi.fn(async () => {
    records.clear();
  });
  const storage = {
    async transaction<T>(
      callback: (transaction: DurableObjectTransaction) => Promise<T>,
    ): Promise<T> {
      return callback({
        async get<V>(key: string): Promise<V | undefined> {
          return records.get(key) as V | undefined;
        },
        async put<V>(key: string, value: V): Promise<void> {
          records.set(key, value);
        },
        setAlarm,
      } as unknown as DurableObjectTransaction);
    },
    setAlarm,
    deleteAll,
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    records,
    setAlarm,
  };
}

function bomPrefixedJson(value: unknown): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const body = new Uint8Array(json.length + 3);
  body.set([0xef, 0xbb, 0xbf], 0);
  body.set(json, 3);
  return body;
}

describe("OIDC replay JSON canonicality", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a BOM-prefixed replay claim without consuming state", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();
    const guard = new NoemaOidcReplayGuard(fake.state);
    const response = await guard.fetch(new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: bomPrefixedJson({ expires_at_epoch_seconds: 2_600 }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(fake.records.size).toBe(0);
    expect(fake.setAlarm).not.toHaveBeenCalled();
  });

  it("rejects a BOM-prefixed replay decision as non-canonical authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const namespace = namespaceReturning(async () => new Response(
      bomPrefixedJson({
        accepted: true,
        expires_at_epoch_seconds: 2_600,
      }),
      {
        status: 201,
        headers: { "content-type": "application/json" },
      },
    ));

    await expect(claimOidcTokenUsage("safe-jti", 2_600, {
      NOEMA_OIDC_REPLAY_GUARD: namespace,
    })).rejects.toBeInstanceOf(OidcReplayUnavailable);
  });
});
