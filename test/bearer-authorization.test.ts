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

describe("canonical OIDC bearer framing", () => {
  it("accepts exactly one ASCII space and preserves the token bytes", () => {
    expect(parseExactBearerToken("Bearer header.payload.signature")).toBe("header.payload.signature");
    expect(parseExactBearerToken("bearer header.payload.signature")).toBe("header.payload.signature");
  });

  it.each([
    "Bearer\theader.payload.signature",
    "Bearer\u00a0header.payload.signature",
    "Bearer  header.payload.signature",
    "Bearer \theader.payload.signature",
    "Bearer header.payload.signature ",
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
    const response = await baseWorker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: "Bearer malformed" },
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
  });
});
