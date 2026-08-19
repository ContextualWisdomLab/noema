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
