import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/index.ts", import.meta.url), "utf8");
const ignoredRegions = [...source.matchAll(/\/\* v8 ignore start \*\/[\s\S]*?\/\* v8 ignore stop \*\//g)]
  .map((match) => match[0]);

describe("owned production coverage exclusions", () => {
  it.each([
    "jsonResponse",
    "trustedTraceHeader",
    "traceIdFromRequest",
    "safeHash",
    "configuredRateLimit",
    "configuredTtlMs",
    "valueType",
    "requestClientKey",
    "enforceRateLimit",
    "cleanupRateLimitBuckets",
    "successResponse",
    "errorResponse",
    "withOperationalHeaders",
    "logRequest",
    "validateRepositoryName",
    "parseExchangeRequestBody",
  ])("keeps %s inside measured production coverage", (functionName) => {
    expect(
      ignoredRegions.some((region) => region.includes(`function ${functionName}`)),
      `${functionName} must not be hidden by a broad v8 ignore region`,
    ).toBe(false);
  });
});
