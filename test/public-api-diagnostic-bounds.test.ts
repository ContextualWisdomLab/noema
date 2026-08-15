import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const rateLimitSource = readFileSync(new URL("../src/rate-limit.ts", import.meta.url), "utf8");
const oidcReplaySource = readFileSync(new URL("../src/oidc-replay.ts", import.meta.url), "utf8");

/**
 * Verifies that a public constructor only promises bounded diagnostic messages
 * when its class implementation contains an observable message-bounding rule.
 */
function expectBoundedDiagnosticClaimImplemented(
  source: string,
  className: string,
  boundedClaim: string,
): void {
  const classStart = source.indexOf(`export class ${className}`);
  expect(classStart, `${className} must remain a public class`).toBeGreaterThanOrEqual(0);

  const docStart = source.lastIndexOf("/**", classStart);
  const docEnd = docStart >= 0 ? source.indexOf("*/", docStart) : -1;
  const adjacent = docEnd >= 0 && source.slice(docEnd + 2, classStart).trim() === "";
  const sliceStart = adjacent ? docStart : classStart;

  const nextClass = source.indexOf("\nexport class ", classStart + 1);
  const nextDoc = nextClass >= 0 ? source.lastIndexOf("/**", nextClass) : -1;
  const sliceEnd = nextDoc > classStart
    ? nextDoc
    : nextClass >= 0
      ? nextClass
      : source.length;
  const classSource = source.slice(sliceStart, sliceEnd);
  if (!classSource.includes(boundedClaim)) return;

  expect(
    classSource,
    `${className} documents a bounded diagnostic but does not bound message input`,
  ).toMatch(/(?:MAX_[A-Z0-9_]*MESSAGE|message\.length|message\.slice\(|message\.substring\()/);
}

describe("public error diagnostic documentation", () => {
  it("does not promise an unimplemented diagnostic-message bound", () => {
    expectBoundedDiagnosticClaimImplemented(
      rateLimitSource,
      "DistributedRateLimitUnavailable",
      "bounded diagnostic message",
    );
    expectBoundedDiagnosticClaimImplemented(
      oidcReplaySource,
      "OidcReplayUnavailable",
      "bounded diagnostic reason",
    );
  });
});
