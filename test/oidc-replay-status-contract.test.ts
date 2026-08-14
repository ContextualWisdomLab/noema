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

  it.each([200, 202, 204])(
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
});
