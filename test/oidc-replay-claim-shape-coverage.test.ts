import { describe, expect, it, vi } from "vitest";
import { NoemaOidcReplayGuard } from "../src/oidc-replay";

function claimWithJsonBody(value: unknown): Request {
  return new Request("https://noema-oidc-replay.internal/claim", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(value),
  });
}

describe("OIDC replay claim request shape coverage", () => {
  it("rejects null and truthy primitive JSON before replay storage access", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const storageAccess = vi.fn();
    const guard = new NoemaOidcReplayGuard({
      storage: {
        transaction: storageAccess,
      },
    } as unknown as DurableObjectState);

    const nullResponse = await guard.fetch(claimWithJsonBody(null));
    const primitiveResponse = await guard.fetch(claimWithJsonBody("2600"));

    expect(nullResponse.status).toBe(400);
    await expect(nullResponse.json()).resolves.toEqual({ ok: false, error: "invalid_expiry" });
    expect(primitiveResponse.status).toBe(400);
    await expect(primitiveResponse.json()).resolves.toEqual({ ok: false, error: "invalid_expiry" });
    expect(storageAccess).not.toHaveBeenCalled();
  });
});
