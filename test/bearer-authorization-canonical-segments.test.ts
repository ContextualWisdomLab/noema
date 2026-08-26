import { describe, expect, it } from "vitest";
import { parseExactBearerToken } from "../src/bearer-authorization";

const canonicalHeader = Buffer.from(JSON.stringify({ alg: "RS256", kid: "kid" })).toString("base64url");
const canonicalPayload = Buffer.from(JSON.stringify({ sub: "repo:ContextualWisdomLab/noema" })).toString("base64url");
const canonicalSignature = Buffer.from([1, 2, 3, 4]).toString("base64url");

describe("parseExactBearerToken canonical JWT segments", () => {
  it("preserves an already-canonical three-segment JWT byte-for-byte", () => {
    const token = `${canonicalHeader}.${canonicalPayload}.${canonicalSignature}`;

    expect(parseExactBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it("recognizes top-level JSON keys when valid JSON whitespace precedes the member colon", () => {
    const header = Buffer.from('{"alg" : "RS256","kid":"kid"}', "utf8").toString("base64url");
    const token = `${header}.${canonicalPayload}.${canonicalSignature}`;

    expect(parseExactBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it("leaves malformed JSON-key escapes for the authoritative JSON parser instead of inventing duplicate authority", () => {
    const malformedJsonHeader = Buffer.from('{"bad\\q":1}', "utf8").toString("base64url");
    const token = `${malformedJsonHeader}.${canonicalPayload}.${canonicalSignature}`;

    expect(parseExactBearerToken(`Bearer ${token}`)).toBe(token);
  });

  it.each([
    ["padded protected header", `${canonicalHeader}=.${canonicalPayload}.${canonicalSignature}`],
    ["padded payload", `${canonicalHeader}.${canonicalPayload}=.${canonicalSignature}`],
    ["padded signature", `${canonicalHeader}.${canonicalPayload}.${canonicalSignature}=`],
    ["invalid protected-header alphabet", `%${canonicalHeader}.${canonicalPayload}.${canonicalSignature}`],
    ["empty payload segment", `${canonicalHeader}..${canonicalSignature}`],
    ["non-JWT bearer credential", "opaque-visible-ascii-token"],
  ])("rejects %s before any downstream claim reader", (_name, token) => {
    expect(parseExactBearerToken(`Bearer ${token}`)).toBeUndefined();
  });
});
