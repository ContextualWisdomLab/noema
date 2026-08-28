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

  it.each([
    "2001:0db8::1",
    "2001:DB8::1",
    "2001:db8:0:0:0:0:0:1",
  ])("rejects a non-canonical IPv6 spelling instead of normalizing it into bucket authority: %s", async (clientIp) => {
    const request = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": clientIp,
      },
    });

    expect(trustedClientIdentifier(request)).toBeUndefined();
    await expect(distributedRateLimitObjectName(request)).rejects.toBeInstanceOf(
      DistributedRateLimitUnavailable,
    );
  });

  it("preserves an already-canonical Cloudflare client IPv6 identity", () => {
    const request = new Request("https://noema.example/exchange", {
      headers: {
        "cf-connecting-ip": "2001:db8::1",
      },
    });

    expect(trustedClientIdentifier(request)).toBe("2001:db8::1");
  });
});