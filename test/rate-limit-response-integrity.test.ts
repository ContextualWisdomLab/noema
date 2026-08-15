import { describe, expect, it } from "vitest";
import {
  checkDistributedRateLimit,
  DistributedRateLimitUnavailable,
  type DistributedRateLimitEnv,
} from "../src/rate-limit";

const request = new Request("https://noema.example/exchange", {
  headers: { "cf-connecting-ip": "203.0.113.91" },
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

function jsonResponse(body: BodyInit, headers: HeadersInit = {}): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json",
      ...headers,
    },
  });
}

function malformedUtf8Decision(): Uint8Array {
  const prefix = new TextEncoder().encode(
    '{"allowed":true,"limit":60,"remaining":59,"retry_after_seconds":0,"diagnostic":"',
  );
  const suffix = new TextEncoder().encode('"}');
  const bytes = new Uint8Array(prefix.byteLength + 1 + suffix.byteLength);
  bytes.set(prefix, 0);
  bytes[prefix.byteLength] = 0xff;
  bytes.set(suffix, prefix.byteLength + 1);
  return bytes;
}

describe("distributed rate-limit response byte integrity", () => {
  it("rejects malformed UTF-8 that replacement decoding would otherwise accept", async () => {
    await expect(
      checkDistributedRateLimit(
        request,
        envReturning(jsonResponse(malformedUtf8Decision())),
      ),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });

  it("rejects escape-equivalent duplicate decision keys before JSON last-key-wins parsing", async () => {
    const ambiguous =
      '{"allowed":false,"all\\u006fwed":true,"limit":60,"remaining":59,"retry_after_seconds":0}';

    await expect(
      checkDistributedRateLimit(request, envReturning(jsonResponse(ambiguous))),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });

  it("rejects an oversized chunked decision response instead of buffering it without a protocol bound", async () => {
    const oversized = JSON.stringify({
      ...decision,
      diagnostic_padding: "x".repeat(8_192),
    });

    await expect(
      checkDistributedRateLimit(request, envReturning(jsonResponse(oversized))),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
  });

  it("rejects an oversized declared response before consuming its body", async () => {
    let pulls = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(new TextEncoder().encode(JSON.stringify(decision)));
        controller.close();
      },
    });
    const response = jsonResponse(body, { "content-length": "8192" });

    await expect(
      checkDistributedRateLimit(request, envReturning(response)),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
    expect(pulls).toBe(0);
  });
});
