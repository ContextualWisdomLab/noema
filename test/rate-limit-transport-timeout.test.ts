import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDistributedRateLimit } from "../src/rate-limit";

function namespaceRequiringBoundedFetch(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        async fetch(_input: RequestInfo | URL, init?: RequestInit) {
          if (!(init?.signal instanceof AbortSignal)) {
            throw new Error("bounded rate-limit fetch signal missing");
          }
          expect(init.signal.aborted).toBe(false);
          return Response.json({
            allowed: true,
            limit: 60,
            remaining: 59,
            retry_after_seconds: 0,
          });
        },
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

describe("distributed rate-limit transport deadline", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("passes a bounded abort signal to the Durable Object decision request", async () => {
    await expect(checkDistributedRateLimit(
      new Request("https://noema.example/exchange", {
        headers: { "cf-connecting-ip": "203.0.113.199" },
      }),
      {
        NOEMA_RATE_LIMIT_PER_MINUTE: "60",
        NOEMA_RATE_LIMITER: namespaceRequiringBoundedFetch(),
      },
    )).resolves.toEqual({
      allowed: true,
      limit: 60,
      remaining: 59,
      retry_after_seconds: 0,
    });
  });
});
