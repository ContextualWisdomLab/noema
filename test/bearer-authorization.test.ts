import { describe, expect, it } from "vitest";
import baseWorker, { type Env } from "../src/index";
import { parseExactBearerToken } from "../src/bearer-authorization";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

const canonicalHeader = Buffer.from("{}", "utf8").toString("base64url");
const canonicalPayload = Buffer.from("{}", "utf8").toString("base64url");
const canonicalSignature = Buffer.from([0]).toString("base64url");
const canonicalToken = `${canonicalHeader}.${canonicalPayload}.${canonicalSignature}`;

describe("canonical OIDC bearer framing", () => {
  it("accepts exactly one ASCII space and preserves canonical JWT bytes", () => {
    expect(parseExactBearerToken(`Bearer ${canonicalToken}`)).toBe(canonicalToken);
    expect(parseExactBearerToken(`bearer ${canonicalToken}`)).toBe(canonicalToken);
  });

  it("bounds canonical bearer credential bytes before downstream JWT parsing", async () => {
    const maximumToken = `${canonicalHeader}.${canonicalPayload}.${"A".repeat(16_376)}`;
    const oversizedAuthorization = `Bearer ${canonicalHeader}.${canonicalPayload}.${"A".repeat(16_377)}`;

    expect(maximumToken).toHaveLength(16_384);
    expect(parseExactBearerToken(`Bearer ${maximumToken}`)).toBe(maximumToken);
    expect(parseExactBearerToken(oversizedAuthorization)).toBeUndefined();

    const response = await baseWorker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: oversizedAuthorization },
    }), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
    });
  });

  it.each([
    `Bearer\t${canonicalToken}`,
    `Bearer\u00a0${canonicalToken}`,
    `Bearer  ${canonicalToken}`,
    `Bearer \t${canonicalToken}`,
    `Bearer ${canonicalToken} `,
  ])("rejects non-canonical bearer framing: %j", (authorization) => {
    expect(parseExactBearerToken(authorization)).toBeUndefined();
  });

  it.each([
    "Bearer\tmalformed",
    "Bearer  malformed",
  ])("rejects non-canonical public exchange framing before JWT parsing: %j", async (authorization) => {
    const response = await baseWorker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization },
    }), env);

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe('Bearer realm="noema", error="invalid_request"');
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
    });
  });

  it("keeps canonical malformed JWTs on the malformed-token boundary", async () => {
    const malformedJsonHeader = Buffer.from("{", "utf8").toString("base64url");
    const malformedToken = `${malformedJsonHeader}.${canonicalPayload}.${canonicalSignature}`;
    const response = await baseWorker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${malformedToken}` },
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });
});
