import { describe, expect, it } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

function envReturning(decision: Record<string, unknown>): DistributedRateLimitEnv {
  const namespace = {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch() {
          return Response.json(decision);
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;

  return {
    NOEMA_RATE_LIMIT_PER_MINUTE: "60",
    NOEMA_RATE_LIMITER: namespace,
  };
}

describe("distributed rate-limit decision coherence", () => {
  it("rejects an allowed decision that claims no capacity was consumed", async () => {
    const request = new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": "203.0.113.252" },
    });

    await expect(checkDistributedRateLimit(request, envReturning({
      allowed: true,
      limit: 60,
      remaining: 60,
      retry_after_seconds: 0,
    }))).rejects.toBeInstanceOf(DistributedRateLimitUnavailable);
  });

  it("keeps the first valid allowed decision coherent with one consumed slot", async () => {
    const request = new Request("https://noema.example/exchange", {
      headers: { "cf-connecting-ip": "203.0.113.253" },
    });

    await expect(checkDistributedRateLimit(request, envReturning({
      allowed: true,
      limit: 60,
      remaining: 59,
      retry_after_seconds: 0,
    }))).resolves.toMatchObject({
      allowed: true,
      limit: 60,
      remaining: 59,
      retry_after_seconds: 0,
    });
  });
});
