import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceRequiringBoundedFetch(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          if (!(init?.signal instanceof AbortSignal)) {
            throw new Error("bounded replay-guard fetch signal missing");
          }
          expect(init.signal.aborted).toBe(false);
          return Response.json({
            accepted: true,
            expires_at_epoch_seconds: 2_600,
          }, { status: 201 });
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("OIDC replay guard transport deadline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a bounded abort signal to the Durable Object claim request", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);

    await expect(claimOidcTokenUsage(
      "bounded-replay-claim",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceRequiringBoundedFetch() },
    )).resolves.toEqual({
      accepted: true,
      expires_at_epoch_seconds: 2_600,
    });
  });
});
