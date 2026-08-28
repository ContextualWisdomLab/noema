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

  it("preserves a canonical string kid for cryptographic verification", () => {
    const token = tokenWithHeader({ alg: "RS256", kid: "github-actions-key" });

    expect(parseExactBearerToken(`Bearer ${token}`)).toBe(token);
  });
});
