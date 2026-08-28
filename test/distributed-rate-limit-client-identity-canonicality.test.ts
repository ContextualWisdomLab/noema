import { describe, expect, it } from "vitest";
import {
  DistributedRateLimitUnavailable,
  distributedRateLimitObjectName,
  trustedClientIdentifier,
} from "../src/rate-limit";

describe("distributed rate-limit client identity canonicality", () => {
  it("rejects non-ASCII surrounding whitespace instead of normalizing it into trusted client authority", async () => {
    const request = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": "\u00a0203.0.113.7\u00a0",
      },
    });

    expect(trustedClientIdentifier(request)).toBeUndefined();
    await expect(distributedRateLimitObjectName(request)).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailable,
    );
  });

  it("preserves an already-canonical Cloudflare client IPv4 identity", () => {
    const request = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": "203.0.113.7",
      },
    });

    expect(trustedClientIdentifier(request)).toBe("203.0.113.7");
  });
});
