import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential-egress transport abort deadlines", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("enforces the deadline before response headers when a transport ignores abort", async () => {
    vi.useFakeTimers();
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const cancel = vi.fn();
    const rawFetch = vi.fn<FetchLike>(() => transport);
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta");
    let observed: Response | undefined;
    let rejected: unknown;
    void pending.then(
      (response) => {
        observed = response;
      },
      (error: unknown) => {
        rejected = error;
      },
    );

    await vi.advanceTimersByTimeAsync(10_000);
    await Promise.resolve();

    try {
      expect(rejected).toBeUndefined();
      expect(observed?.status).toBe(504);
      expect(observed?.headers.get("x-noema-egress-policy")).toBe("blocked-timeout");
    } finally {
      resolveTransport(new Response(new ReadableStream<Uint8Array>({ cancel })));
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves caller cancellation before response headers when a transport ignores abort", async () => {
    const caller = new AbortController();
    const cancellationReason = new DOMException("caller revoked request authority", "AbortError");
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const cancel = vi.fn();
    const rawFetch = vi.fn<FetchLike>(() => transport);
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta", { signal: caller.signal });
    let observed: Response | undefined;
    let rejected: unknown;
    void pending.then(
      (response) => {
        observed = response;
      },
      (error: unknown) => {
        rejected = error;
      },
    );

    caller.abort(cancellationReason);
    await Promise.resolve();
    await Promise.resolve();

    try {
      expect(observed).toBeUndefined();
      expect(rejected).toBe(cancellationReason);
    } finally {
      resolveTransport(new Response(new ReadableStream<Uint8Array>({ cancel })));
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(cancel).toHaveBeenCalledOnce();
  });
});
