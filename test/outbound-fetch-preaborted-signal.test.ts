import { describe, expect, it, vi } from "vitest";
import {
  createFailClosedFetch,
  type FetchLike,
} from "../src/outbound-fetch-policy";

describe("credential-egress caller cancellation authority", () => {
  it("never enters the raw transport when the caller signal is already aborted", async () => {
    const rawFetch = vi.fn<FetchLike>(async () => new Response("unexpected transport"));
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled before egress", "AbortError");
    caller.abort(reason);

    await expect(wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    )).rejects.toBe(reason);
    expect(rawFetch).not.toHaveBeenCalled();
  });

  it("preserves mid-flight caller cancellation even when the transport ignores the abort signal", async () => {
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const rawFetch = vi.fn<FetchLike>(async (_input, init) => {
      expect(init?.signal?.aborted).toBe(false);
      return transport;
    });
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled during egress", "AbortError");

    const pending = wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    );
    await vi.waitFor(() => expect(rawFetch).toHaveBeenCalledTimes(1));
    caller.abort(reason);
    resolveTransport(new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    }));

    await expect(pending).rejects.toBe(reason);
  });

  it("preserves caller cancellation when an abort-ignoring transport rejects later for another reason", async () => {
    let rejectTransport!: (error: Error) => void;
    const transport = new Promise<Response>((_resolve, reject) => {
      rejectTransport = reject;
    });
    const rawFetch = vi.fn<FetchLike>(async () => transport);
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller revoked transport authority", "AbortError");
    const lateFailure = new TypeError("late transport failure");

    const pending = wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    );
    await vi.waitFor(() => expect(rawFetch).toHaveBeenCalledTimes(1));
    caller.abort(reason);
    rejectTransport(lateFailure);

    await expect(pending).rejects.toBe(reason);
  });

  it("preserves mid-flight caller cancellation when the late response is bodyless", async () => {
    let resolveTransport!: (response: Response) => void;
    const transport = new Promise<Response>((resolve) => {
      resolveTransport = resolve;
    });
    const rawFetch = vi.fn<FetchLike>(async () => transport);
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled before a bodyless response", "AbortError");

    const pending = wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    );
    await vi.waitFor(() => expect(rawFetch).toHaveBeenCalledTimes(1));
    caller.abort(reason);
    resolveTransport(new Response(null, { status: 200 }));

    await expect(pending).rejects.toBe(reason);
  });

  it("preserves caller cancellation while an abort-ignoring response body is still streaming", async () => {
    let markPullStarted!: () => void;
    const pullStarted = new Promise<void>((resolve) => {
      markPullStarted = resolve;
    });
    let releaseBody!: () => void;
    const bodyReleased = new Promise<void>((resolve) => {
      releaseBody = resolve;
    });
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        markPullStarted();
        await bodyReleased;
        controller.enqueue(new TextEncoder().encode("{}"));
        controller.close();
      },
    });
    const rawFetch = vi.fn<FetchLike>(async () => new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    const wrapped = createFailClosedFetch(rawFetch);
    const caller = new AbortController();
    const reason = new DOMException("caller cancelled during body streaming", "AbortError");

    const pending = wrapped(
      "https://api.github.com/repos/ContextualWisdomLab/noema/installation",
      {
        method: "GET",
        headers: { authorization: "Bearer sensitive" },
        signal: caller.signal,
      },
    );
    await pullStarted;
    caller.abort(reason);
    releaseBody();

    await expect(pending).rejects.toBe(reason);
  });
});
