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

  it("rejects a response when caller authority is revoked after the transport wins its race", async () => {
    const caller = new AbortController();
    const cancellationReason = new DOMException("caller revoked settling response authority", "AbortError");
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const cancel = vi.fn();

    // Promise.race calls `then` on the native transport promise. Interpose that
    // exact registration so the transport resolves the race first and caller
    // authority is revoked synchronously before the awaiting wrapper resumes.
    // This deterministically exercises the post-transport fail-closed guard.
    const nativeThen = transport.then.bind(transport);
    Object.defineProperty(transport, "then", {
      configurable: true,
      value: ((
        onFulfilled?: ((value: Response) => unknown) | null,
        onRejected?: ((reason: unknown) => unknown) | null,
      ) => nativeThen(
        (response) => {
          const result = onFulfilled ? onFulfilled(response) : response;
          caller.abort(cancellationReason);
          return result;
        },
        onRejected ?? undefined,
      )) as Promise<Response>["then"],
    });

    const rawFetch = vi.fn<FetchLike>(() => transport);
    const wrapped = createFailClosedFetch(rawFetch);
    const pending = wrapped("https://api.github.com/meta", { signal: caller.signal });

    resolveTransport(new Response(new ReadableStream<Uint8Array>({ cancel })));

    await expect(pending).rejects.toBe(cancellationReason);
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
