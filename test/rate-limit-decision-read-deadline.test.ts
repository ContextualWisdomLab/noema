import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDistributedRateLimit,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

const request = new Request("https://noema.example/exchange", {
  headers: { "cf-connecting-ip": "203.0.113.193" },
});

function envReturning(response: Response): DistributedRateLimitEnv {
  return {
    NOEMA_RATE_LIMITER: {
      idFromName(name: string) {
        return { toString: () => name } as DurableObjectId;
      },
      get() {
        return {
          async fetch() {
            return response;
          },
        } as unknown as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
  };
}

describe("distributed rate-limit decision read deadline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed when the response body stalls after the reviewed absolute deadline expires", async () => {
    const deadline = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockReturnValue(deadline.signal);

    const cancel = vi.fn();
    let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        bodyController = controller;
      },
      cancel,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const decision = checkDistributedRateLimit(request, envReturning(response));
    deadline.abort(new DOMException("The operation timed out.", "TimeoutError"));

    let outcome: string;
    try {
      outcome = await Promise.race([
        decision.then(
          () => "unexpected-success",
          (error: unknown) => error instanceof Error ? error.message : String(error),
        ),
        new Promise<string>((resolve) => {
          setTimeout(() => resolve("decision-read-deadline-missing"), 250);
        }),
      ]);
    } finally {
      try {
        bodyController?.close();
      } catch {
        // The repaired path cancels the stream before this test-only cleanup runs.
      }
      void decision.catch(() => undefined);
    }

    expect(outcome).toBe("rate-limit Durable Object decision body read timed out");
    expect(cancel).toHaveBeenCalledOnce();
  });
});
