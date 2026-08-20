import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function noStorageState(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function claimBody(padding = ""): string {
  return JSON.stringify({
    expires_at_epoch_seconds: 2_600,
    ...(padding ? { padding } : {}),
  });
}

describe("OIDC replay guard request-body bounds", () => {
  it("rejects an oversized declared internal claim body before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "513",
      },
      body: claimBody(),
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects a streamed internal claim body that exceeds the byte limit before storage authority", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for an oversized request");
    });
    const guard = new NoemaOidcReplayGuard(noStorageState(transaction));
    const request = new Request("https://noema-oidc-replay.internal/claim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: claimBody("x".repeat(600)),
    });

    const response = await guard.fetch(request);

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "request_too_large",
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
