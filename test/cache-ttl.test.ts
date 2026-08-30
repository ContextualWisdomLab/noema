import { describe, expect, it } from "vitest";
import { configuredTtlMs } from "../src/cache-ttl";

describe("configured cache TTL normalization", () => {
  it.each([
    { raw: undefined, expected: 300_000, reason: "uses the reviewed default when unset" },
    { raw: "NaN", expected: 300_000, reason: "rejects non-finite configuration" },
    { raw: "0", expected: 300_000, reason: "rejects non-positive configuration" },
    { raw: "0.5", expected: 300_000, reason: "does not normalize a positive fraction to zero" },
    { raw: "1.9", expected: 1_000, reason: "preserves existing whole-second floor semantics" },
    { raw: "7200", expected: 3_600_000, reason: "caps excessive configuration" },
    { raw: " 60 ", expected: 300_000, reason: "does not trim operator-controlled TTL authority" },
    { raw: "+60", expected: 300_000, reason: "rejects signed decimal aliases" },
    { raw: "0x10", expected: 300_000, reason: "rejects non-decimal numeric aliases" },
  ])("$reason", ({ raw, expected }) => {
    expect(configuredTtlMs(raw, 300, 3600)).toBe(expected);
  });

  it("keeps the reviewed fallback inside the configured maximum", () => {
    expect(configuredTtlMs(undefined, 7200, 3600)).toBe(3_600_000);
    expect(configuredTtlMs("not-a-number", 7200, 3600)).toBe(3_600_000);
  });
});
