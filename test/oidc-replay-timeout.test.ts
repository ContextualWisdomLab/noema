import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceRequiringBoundedFetch(expectedSignal: AbortSignal): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          if (init?.signal !== expectedSignal) {
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

  it("uses the reviewed deadline for the Durable Object claim request", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const boundedSignal = new AbortController().signal;
    const timeoutSignal = vi.spyOn(AbortSignal, "timeout").mockReturnValue(boundedSignal);

    await expect(claimOidcTokenUsage(
      "bounded-replay-claim",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceRequiringBoundedFetch(boundedSignal) },
    )).resolves.toEqual({
      accepted: true,
      expires_at_epoch_seconds: 2_600,
    });

    expect(timeoutSignal).toHaveBeenCalledOnce();
    expect(timeoutSignal).toHaveBeenCalledWith(10_000);
  });
});
