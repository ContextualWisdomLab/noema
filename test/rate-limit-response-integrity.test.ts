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

  it("accepts diagnostic JSON strings without mistaking values or nested keys for decision keys", async () => {
    const diagnostic =
      '{"diagnostic":{"allowed":"informational"},"note":"allowed","allowed"   :true,"limit":60,"remaining":59,"retry_after_seconds":0}';

    await expect(
      checkDistributedRateLimit(request, envReturning(jsonResponse(diagnostic))),
    ).resolves.toMatchObject(decision);
  });

  it("rejects malformed encoded top-level decision keys before malformed JSON can be trusted", async () => {
    const malformedKey =
      '{"all' + '\\q' + 'wed":true,"limit":60,"remaining":59,"retry_after_seconds":0}';

    await expect(
      checkDistributedRateLimit(request, envReturning(jsonResponse(malformedKey))),
    ).rejects.toThrow("rate-limit Durable Object returned malformed JSON");
  });

  it("rejects a successful response with no decision body", async () => {
    const response = new Response(null, {
      status: 200,
      headers: { "content-type": "application/json" },
    });

    await expect(
      checkDistributedRateLimit(request, envReturning(response)),
    ).rejects.toThrow("rate-limit Durable Object returned an empty decision body");
  });

  it("rejects a decision response when its body stream cannot be read", async () => {
    const response = {
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      body: {
        getReader() {
          return {
            read: async () => {
              throw new Error("simulated response stream failure");
            },
          };
        },
      },
    } as unknown as Response;

    await expect(
      checkDistributedRateLimit(request, envReturning(response)),
    ).rejects.toThrow("rate-limit Durable Object decision body could not be read");
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

  it("rejects an oversized declared response before asking the response for JSON bytes", async () => {
    let jsonCalls = 0;
    const response = {
      status: 200,
      headers: new Headers({
        "content-type": "application/json",
        "content-length": "8192",
      }),
      json: async () => {
        jsonCalls += 1;
        return decision;
      },
      get body(): never {
        throw new Error("body must not be consumed after an oversized declaration");
      },
    } as unknown as Response;

    await expect(
      checkDistributedRateLimit(request, envReturning(response)),
    ).rejects.toThrow(DistributedRateLimitUnavailable);
    expect(jsonCalls).toBe(0);
  });
});
