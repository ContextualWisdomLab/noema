import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimOidcTokenUsage,
  NoemaOidcReplayGuard,
  OidcReplayDetected,
  OidcReplayUnavailable,
  oidcReplayObjectName,
} from "../src/oidc-replay";

function namespaceReturning(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  observedNames: string[] = [],
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      observedNames.push(name);
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
    async transaction<T>(callback: (transaction: {
      get<V>(key: string): Promise<V | undefined>;
      put<V>(key: string, value: V): Promise<void>;
    }) => Promise<T>): Promise<T> {
      return callback({
        async get<V>(key: string): Promise<V | undefined> {
          return records.get(key) as V | undefined;
        },
        async put<V>(key: string, value: V): Promise<void> {
          records.set(key, value);
        },
      });
    },
    setAlarm,
    deleteAll,
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    records,
    setAlarm,
    deleteAll,
  };
}

function claimRequest(expiresAtEpochSeconds: number): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ expires_at_epoch_seconds: expiresAtEpochSeconds }),
  });
}

describe("OIDC replay protection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("derives a deterministic opaque Durable Object name from jti", async () => {
    const jti = "6b0a93e0-86aa-4afb-b0aa-e646cb528762";
    const first = await oidcReplayObjectName(jti);
    const second = await oidcReplayObjectName(jti);

    expect(first).toBe(second);
    expect(first).toMatch(/^oidc:[a-f0-9]{64}$/);
    expect(first).not.toContain(jti);
  });

  it("claims a bounded token identifier through the distributed guard", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const observedNames: string[] = [];
    const handler = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "content-type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({ expires_at_epoch_seconds: 2_600 });
      return Response.json({
        accepted: true,
        expires_at_epoch_seconds: 2_600,
      }, { status: 201 });
    });

    await expect(claimOidcTokenUsage(
      "6b0a93e0-86aa-4afb-b0aa-e646cb528762",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(handler, observedNames) },
    )).resolves.toEqual({ accepted: true, expires_at_epoch_seconds: 2_600 });

    expect(handler).toHaveBeenCalledOnce();
    expect(observedNames).toHaveLength(1);
    expect(observedNames[0]).toMatch(/^oidc:[a-f0-9]{64}$/);
  });

  it("reports a previously claimed token as replayed", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const namespace = namespaceReturning(async () => Response.json({
      accepted: false,
      expires_at_epoch_seconds: 2_600,
    }, { status: 409 }));

    await expect(claimOidcTokenUsage(
      "6b0a93e0-86aa-4afb-b0aa-e646cb528762",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespace },
    )).rejects.toMatchObject({
      name: "OidcReplayDetected",
      expiresAtEpochSeconds: 2_600,
    } satisfies Partial<OidcReplayDetected>);
  });

  it("fails closed for missing bindings, malformed decisions, and unsafe claims", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage("safe-jti", 2_600, {})).rejects.toBeInstanceOf(
      OidcReplayUnavailable,
    );
    await expect(claimOidcTokenUsage(
      "unsafe jti",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () => Response.json({})) },
    )).rejects.toBeInstanceOf(OidcReplayUnavailable);
    await expect(claimOidcTokenUsage(
      "safe-jti",
      2_000,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () => Response.json({})) },
    )).rejects.toBeInstanceOf(OidcReplayUnavailable);
    await expect(claimOidcTokenUsage(
      "safe-jti",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () => Response.json({ accepted: true })) },
    )).rejects.toBeInstanceOf(OidcReplayUnavailable);
  });

  it("persists the first use across object instances and rejects concurrent reuse", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();

    const firstInstance = new NoemaOidcReplayGuard(fake.state);
    const first = await firstInstance.fetch(claimRequest(2_600));
    expect(first.status).toBe(201);
    await expect(first.json()).resolves.toEqual({
      accepted: true,
      expires_at_epoch_seconds: 2_600,
    });
    expect(fake.setAlarm).toHaveBeenCalledWith(2_630_000);

    const restartedInstance = new NoemaOidcReplayGuard(fake.state);
    const second = await restartedInstance.fetch(claimRequest(2_600));
    expect(second.status).toBe(409);
    await expect(second.json()).resolves.toEqual({
      accepted: false,
      expires_at_epoch_seconds: 2_600,
    });
    expect(fake.records.size).toBe(1);
  });

  it("clears the consumed-token record through the object alarm", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();
    const guard = new NoemaOidcReplayGuard(fake.state);

    await guard.fetch(claimRequest(2_600));
    expect(fake.records.size).toBe(1);
    await guard.alarm();
    expect(fake.deleteAll).toHaveBeenCalledOnce();
    expect(fake.records.size).toBe(0);
  });

  it("rejects malformed internal replay-guard requests", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const guard = new NoemaOidcReplayGuard(fakeDurableObjectState().state);

    expect((await guard.fetch(new Request("https://internal/claim"))).status).toBe(404);
    expect((await guard.fetch(new Request("https://internal/claim", {
      method: "POST",
      body: "{}",
    }))).status).toBe(415);
    expect((await guard.fetch(new Request("https://internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not-json",
    }))).status).toBe(400);
    expect((await guard.fetch(claimRequest(2_000))).status).toBe(400);
    expect((await guard.fetch(claimRequest(5_601))).status).toBe(400);
  });

  it("keeps replay consumption after successful JWT and GitHub token validation", () => {
    const workerSource = readFileSync(
      new URL("../src/worker.ts", import.meta.url),
      "utf8",
    );
    const wranglerSource = readFileSync(
      new URL("../wrangler.toml", import.meta.url),
      "utf8",
    );

    const exchangeIndex = workerSource.indexOf("const response = await baseWorker.fetch(request, env);");
    const claimIndex = workerSource.indexOf("await claimOidcTokenUsage(replay.jti, replay.exp, env);");
    expect(exchangeIndex).toBeGreaterThan(-1);
    expect(claimIndex).toBeGreaterThan(exchangeIndex);
    expect(workerSource).toContain("if (response.status < 200 || response.status >= 300)");
    expect(workerSource).toContain("x-oidc-replay-protection");
    expect(wranglerSource).toContain('name = "NOEMA_OIDC_REPLAY_GUARD"');
    expect(wranglerSource).toContain("[exports.NoemaOidcReplayGuard]");
    expect(wranglerSource).toContain('storage = "sqlite"');
  });
});
