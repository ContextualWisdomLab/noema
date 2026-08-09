import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../src/rate-limit.ts", import.meta.url), "utf8");

function jsdocImmediatelyBefore(marker: string): string {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `missing source marker: ${marker}`).toBeGreaterThanOrEqual(0);

  const prefix = source.slice(0, markerIndex);
  const commentStart = prefix.lastIndexOf("/**");
  expect(commentStart, `${marker} must have a preceding JSDoc block`).toBeGreaterThanOrEqual(0);

  const commentEnd = prefix.indexOf("*/", commentStart);
  expect(commentEnd, `${marker} JSDoc must be terminated`).toBeGreaterThan(commentStart);
  expect(
    prefix.slice(commentEnd + 2).trim(),
    `${marker} JSDoc must be immediately adjacent to the documented symbol`,
  ).toBe("");

  return prefix.slice(commentStart, commentEnd + 2);
}

function expectPublicDoc(marker: string, requiredTerms: string[]): void {
  const doc = jsdocImmediatelyBefore(marker);
  expect(doc.length, `${marker} JSDoc must explain behavior rather than act as a label`).toBeGreaterThan(80);
  expect(doc).not.toMatch(/\b(?:TODO|TBD)\b/i);
  for (const term of requiredTerms) {
    expect(doc.toLowerCase(), `${marker} JSDoc must explain ${term}`).toContain(term.toLowerCase());
  }
}

describe("rate-limit public TypeScript API documentation", () => {
  it("documents every exported rate-limit contract with beginner-readable semantics", () => {
    expectPublicDoc("export interface DistributedRateLimitEnv", ["Durable Object", "limit"]);
    expectPublicDoc("export type DistributedRateLimitDecision", ["allowed", "remaining", "retry"]);
    expectPublicDoc("export class DistributedRateLimitUnavailable", ["fail", "rate-limit"]);
    expectPublicDoc("export function configuredDistributedRateLimit", ["@param", "@returns", "default"]);
    expectPublicDoc("export function trustedClientIdentifier", ["@param", "@returns", "CF-Connecting-IP", "trusted"]);
    expectPublicDoc("export async function distributedRateLimitObjectName", ["@param", "@returns", "@throws", "hash"]);
    expectPublicDoc("export async function checkDistributedRateLimit", ["@param", "@returns", "@throws", "Durable Object"]);
    expectPublicDoc("export class NoemaRateLimiter", ["Durable Object", "storage"]);
  });

  it("documents the public Durable Object methods and their failure/cleanup behavior", () => {
    expectPublicDoc("  async fetch(request: Request): Promise<Response>", ["@param", "@returns", "fail"]);
    expectPublicDoc("  async alarm(): Promise<void>", ["@returns", "cleanup", "reschedule"]);
  });
});
