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

  it("keeps rejection authoritative when asynchronous body cancellation rejects", async () => {
    let cancelObserved = false;
    const request = requestWithStream(
      new ReadableStream<Uint8Array>({
        cancel() {
          cancelObserved = true;
          return Promise.reject(new Error("cleanup rejected"));
        },
      }),
      { "content-type": "text/plain" },
    );

    await expectBoundedEarlyRejection(request, { reason: "unsupported_media_type", status: 415 });
    await Promise.resolve();
    expect(cancelObserved).toBe(true);
  });

  it("returns the original POST unchanged when the runtime exposes no body stream", async () => {
    const request = new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "8193",
      },
    });

    expect(request.body).toBeNull();
    await expect(boundExchangeJsonBody(request)).resolves.toEqual({ ok: true, request });
  });

  it("keeps an already-decided rejection when the runtime body becomes unavailable before cleanup", async () => {
    const admittedBody = new ReadableStream<Uint8Array>();
    let bodyReads = 0;
    const request = {
      method: "POST",
      headers: new Headers({ "content-type": "text/plain" }),
      get body() {
        bodyReads += 1;
        return bodyReads === 1 ? admittedBody : null;
      },
    } as unknown as Request;

    await expectBoundedEarlyRejection(request, { reason: "unsupported_media_type", status: 415 });
    expect(bodyReads).toBe(2);
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
