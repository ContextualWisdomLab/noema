import { describe, expect, it } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

const request = new Request("https://noema.example/exchange", {
  headers: { "cf-connecting-ip": "203.0.113.92" },
});

function envReturning(limit: string, response: Response): DistributedRateLimitEnv {
  return {
    NOEMA_RATE_LIMIT_PER_MINUTE: limit,
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

function decisionResponse(limit: number): Response {
  return new Response(JSON.stringify({
    allowed: true,
    limit,
    remaining: Math.max(0, limit - 1),
    retry_after_seconds: 0,
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("distributed rate-limit policy binding", () => {
  it("rejects an otherwise valid decision whose limit differs from the configured authority", async () => {
    await expect(
      checkDistributedRateLimit(request, envReturning("7", decisionResponse(60))),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });
});
