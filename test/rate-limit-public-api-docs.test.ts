import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rateLimitSource = readFileSync(new URL("../src/rate-limit.ts", import.meta.url), "utf8");
const entrypointSource = readFileSync(new URL("../src/entrypoint.ts", import.meta.url), "utf8");
const runtimeEntrypointSource = readFileSync(
  new URL("../src/runtime-entrypoint.ts", import.meta.url),
  "utf8",
);

function jsdocImmediatelyBefore(source: string, marker: string): string {
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

function expectPublicDoc(source: string, marker: string, requiredTerms: string[]): void {
  const doc = jsdocImmediatelyBefore(source, marker);
  expect(doc.length, `${marker} JSDoc must explain behavior rather than act as a label`).toBeGreaterThan(80);
  expect(doc).not.toMatch(/\b(?:TODO|TBD)\b/i);
  for (const term of requiredTerms) {
    expect(doc.toLowerCase(), `${marker} JSDoc must explain ${term}`).toContain(term.toLowerCase());
  }
}

describe("rate-limit public TypeScript API documentation", () => {
  it("documents every exported rate-limit contract with beginner-readable semantics", () => {
    expectPublicDoc(rateLimitSource, "export interface DistributedRateLimitEnv", ["Durable Object", "limit"]);
    expectPublicDoc(rateLimitSource, "export type DistributedRateLimitDecision", ["allowed", "remaining", "retry"]);
    expectPublicDoc(rateLimitSource, "export class DistributedRateLimitUnavailable", ["fail", "rate-limit"]);
    expectPublicDoc(rateLimitSource, "export function configuredDistributedRateLimit", ["@param", "@returns", "default"]);
    expectPublicDoc(rateLimitSource, "export function trustedClientIdentifier", ["@param", "@returns", "CF-Connecting-IP", "trusted"]);
    expectPublicDoc(rateLimitSource, "export async function distributedRateLimitObjectName", ["@param", "@returns", "@throws", "hash"]);
    expectPublicDoc(rateLimitSource, "export async function checkDistributedRateLimit", ["@param", "@returns", "@throws", "Durable Object"]);
    expectPublicDoc(rateLimitSource, "export class NoemaRateLimiter", ["Durable Object", "storage"]);
  });

  it("documents the public Durable Object methods and their failure/cleanup behavior", () => {
    expectPublicDoc(rateLimitSource, "  async fetch(request: Request): Promise<Response>", ["@param", "@returns", "fail"]);
    expectPublicDoc(rateLimitSource, "  async alarm(): Promise<void>", ["@returns", "cleanup", "reschedule"]);
  });
});

describe("entrypoint public TypeScript API documentation", () => {
  it("documents exported request-boundary contracts", () => {
    expectPublicDoc(entrypointSource, "export interface Env extends WorkerEnv {}", ["runtime", "binding"]);
    expectPublicDoc(entrypointSource, "export type BoundedExchangeRequest", ["bounded", "failure"]);
    expectPublicDoc(entrypointSource, "export function isTrustedGithubApiBase", ["@param", "@returns", "exact", "origin"]);
    expectPublicDoc(entrypointSource, "export function isBoundedOidcBearer", ["@param", "@returns", "credential"]);
    expectPublicDoc(entrypointSource, "export async function boundExchangeJsonBody", ["@param", "@returns", "byte", "stream"]);
    expectPublicDoc(entrypointSource, "export default {", ["Worker", "/exchange", "fail"]);
  });
});

describe("runtime entrypoint public TypeScript API documentation", () => {
  it("documents the deployment-facing runtime wrapper", () => {
    expectPublicDoc(runtimeEntrypointSource, "export interface Env extends BaseEnv {}", ["runtime", "binding"]);
    expectPublicDoc(runtimeEntrypointSource, "export default {", ["/ready", "Worker", "readiness"]);
  });
});
