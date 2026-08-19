import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceReturningRawDecision(body: string): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return new Response(body, {
            status: 201,
            headers: { "content-type": "application/json" },
          });
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("OIDC replay guard decision key integrity", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects duplicate decoded authority keys before JSON last-write-wins can alter the decision", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const response = '{"accepted":false,"accepted":true,"expires_at_epoch_seconds":2600}';

    await expect(claimOidcTokenUsage(
      "duplicate-replay-decision-key",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturningRawDecision(response) },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard decision contains duplicate decoded keys",
    });
  });
});
