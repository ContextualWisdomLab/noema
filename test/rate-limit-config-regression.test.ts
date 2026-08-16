import { describe, expect, it } from "vitest";
import { configuredDistributedRateLimit } from "../src/rate-limit";

describe("distributed rate-limit configuration regression", () => {
  it("never normalizes a positive sub-unit rate limit to zero", () => {
    expect(configuredDistributedRateLimit("0.5")).toBe(60);
    expect(configuredDistributedRateLimit("0.999999")).toBe(60);
  });

  it("preserves the existing floor semantics once the configured value can yield a positive integer", () => {
    expect(configuredDistributedRateLimit("1")).toBe(1);
    expect(configuredDistributedRateLimit("1.9")).toBe(1);
  });
});
