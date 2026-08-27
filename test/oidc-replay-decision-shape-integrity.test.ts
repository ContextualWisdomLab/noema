import { describe, expect, it, vi } from "vitest";
import {
  claimOidcTokenUsage,
  OidcReplayUnavailable,
} from "../src/oidc-replay";

function namespaceReturning(response: Response): DurableObjectNamespace {
  return {
    idFromName() {
      return { toString: () => "oidc-replay-shape-test" } as DurableObjectId;
    },
    get() {
      return {
        fetch: vi.fn(async () => response),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("OIDC replay decision shape integrity", () => {
  it("rejects an otherwise-valid replay decision carrying an unreviewed top-level field", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    const expiresAt = 1_100;
    const response = Response.json({
      accepted: true,
      expires_at_epoch_seconds: expiresAt,
      diagnostic: "unreviewed-authority",
    }, { status: 201 });

    await expect(claimOidcTokenUsage("replay-shape-test", expiresAt, {
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response),
    })).rejects.toBeInstanceOf(OidcReplayUnavailable);
  });
});
