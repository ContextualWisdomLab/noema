import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("OIDC replay retained-heap bounds", () => {
  it("keeps replay decision and claim storage independent of stream chunk cardinality", () => {
    const source = readFileSync("src/oidc-replay.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(value)");
    expect(source).toContain("const decisionStorage = new Uint8Array(MAX_REPLAY_GUARD_DECISION_BYTES)");
    expect(source).toContain("value.byteLength > MAX_REPLAY_GUARD_DECISION_BYTES - totalBytes");
    expect(source).toContain("decisionStorage.set(value, totalBytes)");
    expect(source).toContain("const bytes = decisionStorage.subarray(0, totalBytes)");
    expect(source).toContain("const requestStorage = new Uint8Array(MAX_REPLAY_GUARD_REQUEST_BYTES)");
    expect(source).toContain("value.byteLength > MAX_REPLAY_GUARD_REQUEST_BYTES - totalBytes");
    expect(source).toContain("requestStorage.set(value, totalBytes)");
    expect(source).toContain("const bytes = requestStorage.subarray(0, totalBytes)");
  });
});
