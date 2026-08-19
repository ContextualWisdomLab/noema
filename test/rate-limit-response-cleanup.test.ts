import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkDistributedRateLimit,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

const request = new Request("https://noema.example/exchange", {
  headers: { "cf-connecting-ip": "203.0.113.192" },
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

function responseWithCancelableBody(status: number, headers: HeadersInit): {
  response: Response;
  cancel: ReturnType<typeof vi.fn>;
} {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({ cancel });
  return {
    response: new Response(body, { status, headers }),
    cancel,
  };
}

async function rejectionOutcome(
  response: Response,
  timeoutMs = 500,
): Promise<string> {
  return Promise.race([
    checkDistributedRateLimit(request, envReturning(response)).then(
      () => "unexpected-success",
      (error: unknown) => error instanceof Error ? error.message : String(error),
    ),
    new Promise<string>((resolve) => {
      setTimeout(() => resolve("cleanup-timeout"), timeoutMs);
    }),
  ]);
}

describe("distributed rate-limit rejected-response cleanup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels a declared oversized decision body before failing closed", async () => {
    const { response, cancel } = responseWithCancelableBody(200, {
      "content-type": "application/json",
      "content-length": "4097",
    });

    await expect(checkDistributedRateLimit(request, envReturning(response))).rejects.toThrow(
      "rate-limit Durable Object decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("preserves the declared-oversize classification when cleanup itself fails", async () => {
    const cancel = vi.fn(() => {
      throw new Error("rate-limit response cancellation failed");
    });
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": "4097",
      },
    });

    await expect(checkDistributedRateLimit(request, envReturning(response))).rejects.toThrow(
      "rate-limit Durable Object decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not wait forever for best-effort cleanup before rejecting an oversized decision", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": "4097",
      },
    });

    expect(await rejectionOutcome(response)).toBe(
      "rate-limit Durable Object decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("does not wait forever for best-effort reader cleanup after streamed overflow", async () => {
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(4_097));
      },
      cancel,
    });
    const response = new Response(body, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    expect(await rejectionOutcome(response)).toBe(
      "rate-limit Durable Object decision exceeds the response byte limit",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels a non-200 response body before failing closed", async () => {
    const { response, cancel } = responseWithCancelableBody(503, {
      "content-type": "application/json",
    });

    await expect(checkDistributedRateLimit(request, envReturning(response))).rejects.toThrow(
      "rate-limit Durable Object returned HTTP 503",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("cancels an unexpected-content-type body before failing closed", async () => {
    const { response, cancel } = responseWithCancelableBody(200, {
      "content-type": "text/plain",
    });

    await expect(checkDistributedRateLimit(request, envReturning(response))).rejects.toThrow(
      "rate-limit Durable Object returned an invalid content type",
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
});
