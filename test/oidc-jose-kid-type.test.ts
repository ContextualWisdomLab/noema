import { describe, expect, it } from "vitest";
import { parseExactBearerToken } from "../src/bearer-authorization";

const payload = Buffer.from("{}", "utf8").toString("base64url");
const signature = Buffer.from([0]).toString("base64url");

function tokenWithHeader(header: unknown): string {
  const encodedHeader = Buffer.from(JSON.stringify(header), "utf8").toString("base64url");
  return `${encodedHeader}.${payload}.${signature}`;
}

describe("OIDC JOSE key-id type authority", () => {
  it.each([
    ["number", 1],
    ["boolean", true],
    ["object", { value: "kid" }],
    ["array", ["kid"]],
  ])("rejects a present non-string kid before downstream key discovery: %s", (_label, kid) => {
    const token = tokenWithHeader({ alg: "RS256", kid });

    expect(parseExactBearerToken(`Bearer ${token}`)).toBeUndefined();
  });

  it.each([
    ["empty", ""],
    ["oversized", "k".repeat(129)],
    ["control", "github\nkey"],
    ["non-ascii", "github-키"],
  ])("rejects a string kid outside the bounded visible-ASCII discovery authority: %s", (_label, kid) => {
    const token = tokenWithHeader({ alg: "RS256", kid });

    expect(parseExactBearerToken(`Bearer ${token}`)).toBeUndefined();
  });

  it.each([
    "cc413527-173f-5a05-976e-9c52b1d7b431",
    "38E9B30B3A023A1B72309921A69A42FCC496C42C",
  ])("preserves a current GitHub-compatible canonical string kid for cryptographic verification: %s", (kid) => {
    const token = tokenWithHeader({ alg: "RS256", kid });

    expect(parseExactBearerToken(`Bearer ${token}`)).toBe(token);
  });
});
