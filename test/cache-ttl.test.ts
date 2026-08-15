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
  ])("$reason", ({ raw, expected }) => {
    expect(configuredTtlMs(raw, 300, 3600)).toBe(expected);
  });
});
