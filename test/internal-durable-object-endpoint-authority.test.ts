import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";
import { NoemaRateLimiter } from "../src/rate-limit";

function stateThatRejectsStorageAccess() {
  const transaction = vi.fn(async () => {
    throw new Error("storage must not be touched for a non-canonical internal endpoint");
  });
  const storage = {
    transaction,
    deleteAll: vi.fn(async () => undefined),
    setAlarm: vi.fn(async () => undefined),
  };
  return {
    state: { storage } as unknown as DurableObjectState,
    transaction,
  };
}

describe("internal Durable Object endpoint authority", () => {
  it.each([
    "https://other.internal/check",
    "https://noema-rate-limit.internal/check?scope=other",
  ])("rejects non-canonical rate-limit endpoint identity before storage: %s", async (url) => {
    const fake = stateThatRejectsStorageAccess();
    const limiter = new NoemaRateLimiter(fake.state);
    const response = await limiter.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ limit: 60 }),
    }));

    expect(response.status).toBe(404);
    expect(fake.transaction).not.toHaveBeenCalled();
  });

  it.each([
    "https://other.internal/claim",
    "https://noema-oidc-replay.internal/claim?scope=other",
  ])("rejects non-canonical replay endpoint identity before storage: %s", async (url) => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const fake = stateThatRejectsStorageAccess();
    const replayGuard = new NoemaOidcReplayGuard(fake.state);
    const response = await replayGuard.fetch(new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_at_epoch_seconds: 1_100 }),
    }));

    expect(response.status).toBe(404);
    expect(fake.transaction).not.toHaveBeenCalled();
  });
});
