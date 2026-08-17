import { afterEach, describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function fakeDurableObjectState() {
  const records = new Map<string, unknown>();
  const setAlarm = vi.fn(async () => undefined);
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
    deleteAll: vi.fn(async () => {
      records.clear();
    }),
  };

  return {
    state: { storage } as unknown as DurableObjectState,
    records,
  };
}

function requestWithContentType(contentType: string): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": contentType },
    body: JSON.stringify({ expires_at_epoch_seconds: 2_600 }),
  });
}

describe("OIDC replay media-type boundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts application/json case-insensitively with ordinary parameters", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();
    const guard = new NoemaOidcReplayGuard(fake.state);

    const response = await guard.fetch(requestWithContentType("Application/JSON; charset=utf-8"));

    expect(response.status).toBe(201);
    expect(fake.records.size).toBe(1);
  });

  it("rejects JSON-suffixed media types when the endpoint requires application/json", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const fake = fakeDurableObjectState();
    const guard = new NoemaOidcReplayGuard(fake.state);

    const response = await guard.fetch(requestWithContentType("application/problem+json"));

    expect(response.status).toBe(415);
    expect(fake.records.size).toBe(0);
  });
});
