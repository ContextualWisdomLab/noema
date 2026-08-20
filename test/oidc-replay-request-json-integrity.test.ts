import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function stateWithObservedTransaction(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function requestWithRawBody(body: string): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("OIDC replay claim JSON integrity", () => {
  it.each([
    '{"expires_at_epoch_seconds":2600,"expires_at_epoch_seconds":2700}',
    '{"expires_at_epoch_seconds":2600,"\\u0065xpires_at_epoch_seconds":2700}',
  ])("rejects duplicate decoded expiry authority before storage: %s", async (body) => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for ambiguous authority JSON");
    });
    const guard = new NoemaOidcReplayGuard(stateWithObservedTransaction(transaction));

    const response = await guard.fetch(requestWithRawBody(body));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });
});
