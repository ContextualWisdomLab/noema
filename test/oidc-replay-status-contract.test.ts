import { afterEach, describe, expect, it, vi } from "vitest";
import {
  claimOidcTokenUsage,
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

describe("OIDC replay guard status contract", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([200, 202, 206])(
    "fails closed when an accepted replay decision uses unexpected HTTP %s",
    async (status) => {
      vi.spyOn(Date, "now").mockReturnValue(2_000_000);
      const namespace = namespaceReturning(async () => Response.json({
        accepted: true,
        expires_at_epoch_seconds: 2_600,
      }, { status }));

      await expect(claimOidcTokenUsage(
        "safe-jti",
        2_600,
        { NOEMA_OIDC_REPLAY_GUARD: namespace },
      )).rejects.toMatchObject({
        name: "OidcReplayUnavailable",
        message: `OIDC replay guard returned HTTP ${status}`,
      } satisfies Partial<OidcReplayUnavailable>);
    },
  );

  it("fails closed when a successful replay response is not application/json", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const namespace = namespaceReturning(async () => new Response(JSON.stringify({
      accepted: true,
      expires_at_epoch_seconds: 2_600,
    }), {
      status: 201,
      headers: { "content-type": "text/plain; charset=utf-8" },
    }));

    await expect(claimOidcTokenUsage(
      "safe-jti",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespace },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard returned an unexpected content type",
    } satisfies Partial<OidcReplayUnavailable>);
  });
});
