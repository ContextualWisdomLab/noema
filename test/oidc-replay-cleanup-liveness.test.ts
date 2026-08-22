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

async function boundedOutcome(response: Response): Promise<string> {
  return Promise.race([
    claimOidcTokenUsage(
      `cleanup-liveness-${crypto.randomUUID()}`,
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response) },
    ).then(
      () => "accepted",
      (error: unknown) => error instanceof Error ? error.message : String(error),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("cleanup-timeout"), 500);
    }),
  ]);
}

describe("OIDC replay guard cleanup liveness", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not await a never-settling cancellation after declared oversize rejection", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "content-length": "4097",
      },
    });

    expect(await boundedOutcome(response)).toBe(
      "OIDC replay guard decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not await a never-settling reader cancellation after streamed overflow", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_097));
      },
      cancel,
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });

    expect(await boundedOutcome(response)).toBe(
      "OIDC replay guard decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not await a never-settling cancellation after media-type rejection", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 201,
      headers: { "content-type": "text/plain" },
    });

    expect(await boundedOutcome(response)).toBe(
      "OIDC replay guard returned an unexpected content type",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
