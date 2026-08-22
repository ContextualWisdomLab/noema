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

describe("OIDC replay response cancellation", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserves the oversize classification when stream cancellation fails", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_097));
      },
      cancel() {
        throw new Error("cancel failed");
      },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    await expect(claimOidcTokenUsage(
      "bounded-replay-cancel-failure",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response) },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard decision exceeds the response byte limit",
    });
  });

  it("preserves the oversize classification when stream cancellation rejects asynchronously", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_097));
      },
      cancel() {
        return Promise.reject(new Error("async cancel failed"));
      },
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    await expect(claimOidcTokenUsage(
      "bounded-replay-async-cancel-failure",
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response) },
    )).rejects.toMatchObject({
      name: "OidcReplayUnavailable",
      message: "OIDC replay guard decision exceeds the response byte limit",
    });
    await Promise.resolve();
  });
});