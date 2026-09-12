import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("distributed rate-limit retained-heap bounds", () => {
  it("keeps request and decision storage independent of stream chunk cardinality", () => {
    const source = readFileSync("src/rate-limit.ts", "utf8");
    expect(source).not.toContain("const chunks: Uint8Array[] = []");
    expect(source).not.toContain("chunks.push(value)");
    expect(source).toContain("const requestStorage = new Uint8Array(MAX_RATE_LIMIT_REQUEST_BYTES)");
    expect(source).toContain("value.byteLength > MAX_RATE_LIMIT_REQUEST_BYTES - totalBytes");
    expect(source).toContain("requestStorage.set(value, totalBytes)");
    expect(source).toContain("const bytes = requestStorage.subarray(0, totalBytes)");
    expect(source).toContain("const decisionStorage = new Uint8Array(MAX_RATE_LIMIT_DECISION_BYTES)");
    expect(source).toContain("value.byteLength > MAX_RATE_LIMIT_DECISION_BYTES - totalBytes");
    expect(source).toContain("decisionStorage.set(value, totalBytes)");
    expect(source).toContain("const bytes = decisionStorage.subarray(0, totalBytes)");
  });

  it("releases both request and decision stream reader locks on every terminal path", () => {
    const source = readFileSync("src/rate-limit.ts", "utf8");
    const requestReader = source.slice(
      source.indexOf("async function readBoundedRateLimitRequest"),
      source.indexOf("async function readBoundedRateLimitDecision"),
    );
    const decisionReader = source.slice(
      source.indexOf("async function readBoundedRateLimitDecision"),
      source.indexOf("export async function checkDistributedRateLimit"),
    );

    expect(requestReader).toContain("finally");
    expect(requestReader).toContain("reader.releaseLock()");
    expect(decisionReader).toContain("finally");
    expect(decisionReader).toContain("reader.releaseLock()");
  });
});
