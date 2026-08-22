import { describe, expect, it } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

function requestWithStream(
  stream: ReadableStream<Uint8Array>,
  headers: HeadersInit,
): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers,
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

async function expectBoundedEarlyRejection(
  request: Request,
  expected: { reason: "too_large" | "unsupported_media_type"; status: 413 | 415 },
): Promise<void> {
  const result = await Promise.race([
    boundExchangeJsonBody(request),
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("early rejection waited for request-body cleanup")), 100);
    }),
  ]);

  expect(result).toEqual({ ok: false, failure: expected });
}

describe("exchange JSON body early-rejection cleanup", () => {
  it("cancels a declared-oversized request body without awaiting cancellation", async () => {
    let cancelObserved = false;
    const request = requestWithStream(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelObserved = true;
          return new Promise<void>(() => undefined);
        },
      }),
      {
        "content-type": "application/json",
        "content-length": "8193",
      },
    );

    await expectBoundedEarlyRejection(request, { reason: "too_large", status: 413 });
    expect(cancelObserved).toBe(true);
  });

  it("rejects a declared-oversized request even when the runtime exposes no body stream to cancel", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "8193",
      },
    });

    expect(request.body).toBeNull();
    await expectBoundedEarlyRejection(request, { reason: "too_large", status: 413 });
  });

  it("cancels an unsupported-media request body without awaiting cancellation", async () => {
    let cancelObserved = false;
    const request = requestWithStream(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelObserved = true;
          return new Promise<void>(() => undefined);
        },
      }),
      { "content-type": "text/plain" },
    );

    await expectBoundedEarlyRejection(request, { reason: "unsupported_media_type", status: 415 });
    expect(cancelObserved).toBe(true);
  });
});
