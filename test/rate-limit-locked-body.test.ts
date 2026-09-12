import { describe, expect, it, vi } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  type DistributedRateLimitEnv,
  NoemaRateLimiter,
} from "../src/rate-limit";

function stateWithoutStorageAuthority(transaction: ReturnType<typeof vi.fn>): DurableObjectState {
  return {
    storage: { transaction },
  } as unknown as DurableObjectState;
}

function envReturning(response: Response): DistributedRateLimitEnv {
  return {
    NOEMA_RATE_LIMITER: {
      idFromName(name: string) {
        return { toString: () => name } as DurableObjectId;
      },
      get() {
        return {
          fetch: async () => response,
        } as unknown as DurableObjectStub;
      },
    } as unknown as DurableObjectNamespace,
  };
}

describe("distributed rate-limit locked body acquisition", () => {
  it("rejects a locked internal request as malformed before storage authority", async () => {
    const transaction = vi.fn(async () => {
      throw new Error("storage must not be reached for a locked limiter request");
    });
    const limiter = new NoemaRateLimiter(stateWithoutStorageAuthority(transaction));
    const request = new Request("https://noema-rate-limit.internal/check", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"limit":60}',
    });
    vi.spyOn(request.body!, "getReader").mockImplementation(() => {
      throw new TypeError("simulated locked rate-limit request body");
    });

    const response = await limiter.fetch(request);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: "malformed_json",
    });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("normalizes a locked decision body to the stable unavailable contract", async () => {
    const response = {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader(): never {
          throw new TypeError("simulated locked rate-limit decision body");
        },
      },
    } as unknown as Response;
    const request = new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": "203.0.113.92" },
    });

    await expect(
      checkDistributedRateLimit(request, envReturning(response)),
    ).rejects.toThrow(
      new DistributedRateLimitUnavailable(
        "rate-limit Durable Object decision body could not be read",
      ),
    );
  });
});
