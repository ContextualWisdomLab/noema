import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential-egress streamed response deadlines", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the bounded timeout response when the deadline expires while reading the response body", async () => {
    vi.useFakeTimers();
    const rawFetch = vi.fn<FetchLike>(async (_input, init) => {
      const signal = init?.signal;
      if (!signal) throw new Error("expected bounded outbound signal");
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          signal.addEventListener("abort", () => controller.error(signal.reason), { once: true });
        },
      });
      return new Response(body);
    });
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta");
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(response.status).toBe(504);
    expect(response.statusText).toBe("Gateway Timeout");
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-timeout");
    expect(await response.text()).toBe("");
  });

  it("enforces the deadline when a transport body ignores abort", async () => {
    vi.useFakeTimers();
    let markBodyReadStarted!: () => void;
    const bodyReadStarted = new Promise<void>((resolve) => {
      markBodyReadStarted = resolve;
    });
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        markBodyReadStarted();
        return new Promise<void>(() => undefined);
      },
      cancel,
    }, { highWaterMark: 0 });
    const rawFetch = vi.fn<FetchLike>(async () => new Response(body));
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta");
    await bodyReadStarted;
    await vi.advanceTimersByTimeAsync(10_000);
    const response = await pending;

    expect(cancel).toHaveBeenCalledOnce();
    expect(response.status).toBe(504);
    expect(response.headers.get("x-noema-egress-policy")).toBe("blocked-timeout");
  });
});
