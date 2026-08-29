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
    const rawFetch = vi.fn<FetchLike>(() => transport);
    const wrapped = createFailClosedFetch(rawFetch);

    const pending = wrapped("https://api.github.com/meta", { signal: caller.signal });
    const rejection = pending.then(
      () => undefined,
      (error: unknown) => error,
    );

    caller.abort(cancellationReason);

    try {
      await expect(rejection).resolves.toBe(cancellationReason);
    } finally {
      resolveTransport(new Response(null));
      await Promise.resolve();
      await Promise.resolve();
    }
  });

  it("rejects a response when caller authority is revoked as response headers settle", async () => {
    const caller = new AbortController();
    const cancellationReason = new DOMException("caller revoked settling response authority", "AbortError");
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const cancel = vi.fn();

    void transport.then(() => {
      queueMicrotask(() => caller.abort(cancellationReason));
    });

    const rawFetch = vi.fn<FetchLike>(() => transport);
    const wrapped = createFailClosedFetch(rawFetch);
    const pending = wrapped("https://api.github.com/meta", { signal: caller.signal });

    resolveTransport(new Response(new ReadableStream<Uint8Array>({ cancel })));

    await expect(pending).rejects.toBe(cancellationReason);
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cleans a late response when transport revokes caller authority synchronously", async () => {
    const caller = new AbortController();
    const cancellationReason = new DOMException("transport observed caller revocation", "AbortError");
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const cancel = vi.fn();
    const rawFetch = vi.fn<FetchLike>(() => {
      caller.abort(cancellationReason);
      return transport;
    });
    const wrapped = createFailClosedFetch(rawFetch);

    await expect(
      wrapped("https://api.github.com/meta", { signal: caller.signal }),
    ).rejects.toBe(cancellationReason);

    resolveTransport(new Response(new ReadableStream<Uint8Array>({ cancel })));
    await Promise.resolve();
    await Promise.resolve();

    expect(cancel).toHaveBeenCalledOnce();
  });
});
