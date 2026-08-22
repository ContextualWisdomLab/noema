import { describe, expect, it } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

const request = new Request("https://noema.example/exchange", {
  headers: { "cf-connecting-ip": "203.0.113.90" },
});

const decision = {
  allowed: true,
  limit: 60,
  remaining: 59,
  retry_after_seconds: 0,
};

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

describe("distributed rate-limit response protocol", () => {
  it("accepts only the exact HTTP 200 JSON decision contract", async () => {
    await expect(
      checkDistributedRateLimit(
        request,
        envReturning(new Response(JSON.stringify(decision), {
          status: 200,
          headers: { "content-type": "application/json; charset=utf-8" },
        })),
      ),
    ).resolves.toEqual(decision);

    await expect(
      checkDistributedRateLimit(request, envReturning(Response.json(decision, { status: 201 }))),
    ).rejects.toThrow(DistributedRateLimitUnavailable);

    await expect(
      checkDistributedRateLimit(
        request,
        envReturning(new Response(JSON.stringify(decision), {
          status: 200,
          headers: { "content-type": "text/plain; profile=application/json" },
        })),
      ),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });

  it("rejects a decision with unexpected top-level authority fields", async () => {
    await expect(
      checkDistributedRateLimit(
        request,
        envReturning(Response.json({
          ...decision,
          unexpected_authority: true,
        })),
      ),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });
});
