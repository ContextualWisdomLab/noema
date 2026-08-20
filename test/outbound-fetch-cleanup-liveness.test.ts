import { describe, expect, it, vi } from "vitest";
import { createFailClosedFetch, type FetchLike } from "../src/outbound-fetch-policy";

const trustedUrl = "https://api.github.com/meta";

async function boundedOutcome(response: Response): Promise<string> {
  const rawFetch = vi.fn<FetchLike>(async () => response);
  const wrapped = createFailClosedFetch(rawFetch);
  return Promise.race([
    wrapped(trustedUrl).then((value) => value.headers.get("x-noema-egress-policy") ?? "allowed"),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("cleanup-timeout"), 500);
    }),
  ]);
}

describe("outbound response cleanup liveness", () => {
  it("does not await a never-settling cancellation after declared oversize rejection", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "content-length": "1048577" },
    });

    expect(await boundedOutcome(response)).toBe("blocked-response-size");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not await a never-settling reader cancellation after streamed overflow", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1_048_577));
      },
      cancel,
    }));

    expect(await boundedOutcome(response)).toBe("blocked-response-size");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cleans up a response stream that fails while being read without replacing the fail-closed result", async () => {
    const response = new Response("ignored");
    const cancel = vi.fn(async () => undefined);
    vi.spyOn(response.body!, "getReader").mockReturnValue({
      read: vi.fn(async () => {
        throw new Error("synthetic outbound response read failure");
      }),
      cancel,
    } as unknown as ReadableStreamDefaultReader<Uint8Array>);

    expect(await boundedOutcome(response)).toBe("blocked-response-read");
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not retain or await a blocked redirect response body", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 302,
      headers: { location: "https://example.invalid/redirect-target" },
    });

    expect(await boundedOutcome(response)).toBe("blocked-redirect");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
