import { describe, expect, it } from "vitest";
import { configuredDistributedRateLimit } from "../src/rate-limit";

describe("distributed rate-limit configuration regression", () => {
  it("uses the safe default when distributed rate-limit configuration is absent", () => {
    expect(configuredDistributedRateLimit(undefined)).toBe(60);
  });

  it("rejects a canonical zero rate limit instead of creating a disabled throttle", () => {
    expect(configuredDistributedRateLimit("0")).toBe(60);
  });

  it("never normalizes a positive sub-unit rate limit to zero", () => {
    expect(configuredDistributedRateLimit("0.5")).toBe(60);
    expect(configuredDistributedRateLimit("0.999999")).toBe(60);
  });

  it("preserves the existing floor semantics once the configured value can yield a positive integer", () => {
    expect(configuredDistributedRateLimit("1")).toBe(1);
    expect(configuredDistributedRateLimit("1.9")).toBe(1);
  });

  it("does not normalize alternate textual spellings into rate-limit authority", () => {
    expect(configuredDistributedRateLimit(" 120 ")).toBe(60);
    expect(configuredDistributedRateLimit("+120")).toBe(60);
    expect(configuredDistributedRateLimit("0120")).toBe(60);
    expect(configuredDistributedRateLimit("0x78")).toBe(60);
    expect(configuredDistributedRateLimit("1.2e2")).toBe(60);
    expect(configuredDistributedRateLimit("120")).toBe(120);
    expect(configuredDistributedRateLimit("10001")).toBe(10_000);
  });
});
