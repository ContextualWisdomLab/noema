import { afterEach, describe, expect, it, vi } from "vitest";
import { claimOidcTokenUsage } from "../src/oidc-replay";

function namespaceReturning(response: () => Response): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return response();
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

async function expectUnavailable(response: () => Response, message: string): Promise<void> {
  await expect(claimOidcTokenUsage(
    "bounded-replay-response",
    2_600,
    { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(response) },
  )).rejects.toMatchObject({
    name: "OidcReplayUnavailable",
    message,
  });
}

function acceptedDecision(headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify({
    accepted: true,
    expires_at_epoch_seconds: 2_600,
  }), {
    status: 201,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

describe("OIDC replay guard response bounds", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a declared response larger than the replay decision budget", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expectUnavailable(
      () => new Response("{}", {
        status: 201,
        headers: {
          "content-type": "application/json",
          "content-length": "4097",
        },
      }),
      "OIDC replay guard decision exceeds the response byte limit",
    );
  });

  it("cancels a declared oversized response body before rejecting it", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 201,
      headers: {
        "content-type": "application/json",
        "content-length": "4097",
      },
    });

    await expectUnavailable(
      () => response,
      "OIDC replay guard decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([
    ["bounded numeric content length", "64"],
    ["non-numeric content length", "unknown"],
  ])("accepts a valid decision with %s", async (_case, contentLength) => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expect(claimOidcTokenUsage(
      `bounded-${contentLength}`,
      2_600,
      { NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(() => acceptedDecision({
        "content-length": contentLength,
      })) },
    )).resolves.toEqual({
      accepted: true,
      expires_at_epoch_seconds: 2_600,
    });
  });

  it("rejects a streamed response larger than the replay decision budget", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expectUnavailable(
      () => new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array(4_097));
          controller.close();
        },
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      "OIDC replay guard decision exceeds the response byte limit",
    );
  });

  it("rejects an empty replay decision body", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expectUnavailable(
      () => new Response(null, {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      "OIDC replay guard returned an empty decision body",
    );
  });

  it("rejects invalid UTF-8 replay decision bytes", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expectUnavailable(
      () => new Response(Uint8Array.of(0xff), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      "OIDC replay guard decision is not valid UTF-8",
    );
  });

  it("fails closed when the replay decision stream cannot be read", async () => {
    vi.spyOn(Date, "now").mockReturnValue(2_000_000);
    await expectUnavailable(
      () => new Response(new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.error(new Error("replay stream failed"));
        },
      }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
      "OIDC replay guard decision body could not be read",
    );
  });
});
