import { describe, expect, it, vi } from "vitest";
import { boundExchangeJsonBody } from "../src/entrypoint";

function streamedJsonRequest(stream: ReadableStream<Uint8Array>): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit & { duplex: "half" });
}

describe("exchange JSON body cleanup liveness", () => {
  it("releases the consumed request reader after a successful bounded read", async () => {
    const encoder = new TextEncoder();
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("{}"));
        controller.close();
      },
    }));

    const result = await boundExchangeJsonBody(request);
    expect(result.ok).toBe(true);

    const postReadReader = request.body!.getReader();
    postReadReader.releaseLock();
  });

  it("does not await a never-settling stream cancellation after the body is already oversized", async () => {
    let observeCancel: (() => void) | undefined;
    const cancelObserved = new Promise<void>((resolve) => {
      observeCancel = resolve;
    });
    let emitted = false;
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>({
      pull(controller) {
        if (emitted) return;
        emitted = true;
        controller.enqueue(new Uint8Array(8_193));
      },
      cancel() {
        observeCancel?.();
        return new Promise<void>(() => undefined);
      },
    }));

    let settled = false;
    const resultPromise = boundExchangeJsonBody(request).then((result) => {
      settled = true;
      return result;
    });

    await cancelObserved;
    await Promise.resolve();
    await Promise.resolve();

    expect(settled).toBe(true);
    await expect(resultPromise).resolves.toEqual({
      ok: false,
      failure: { reason: "too_large", status: 413 },
    });
  });

  it("cleans up a request stream that fails while being read without replacing the unreadable rejection", async () => {
    const request = streamedJsonRequest(new ReadableStream<Uint8Array>());
    const cancel = vi.fn(async () => undefined);
    const releaseLock = vi.fn(() => {
      throw new TypeError("synthetic pending-read lock");
    });
    vi.spyOn(request.body!, "getReader").mockReturnValue({
      read: vi.fn(async () => {
        throw new Error("synthetic exchange request read failure");
      }),
      cancel,
      releaseLock,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>);

    await expect(boundExchangeJsonBody(request)).resolves.toEqual({
      ok: false,
      failure: { reason: "unreadable", status: 400 },
    });
    expect(cancel).toHaveBeenCalledOnce();
    expect(releaseLock).toHaveBeenCalled();
  });
});
