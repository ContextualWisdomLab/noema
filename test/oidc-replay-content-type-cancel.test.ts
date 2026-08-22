import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceReturning(response: Response): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return response;
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("OIDC replay guard unexpected-media response cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels an unexpected-content-type body before failing closed", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 201,
      headers: { "content-type": "text/plain" },
    });

    await expect(claimOidcTokenUsage(
      "unexpected-content-type",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response) },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard returned an unexpected content type",
    });
    expect(cancel).toHaveBeenCalledOnce();
  });
});
