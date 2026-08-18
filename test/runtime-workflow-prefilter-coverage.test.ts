import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/runtime-entrypoint";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-authentication",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

describe("runtime workflow-source prefilter coverage", () => {
  it("delegates an exchange request without bearer credentials to the authoritative auth boundary", async () => {
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.126" },
      }),
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
    });
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="noema", error="invalid_request"',
    );
  });
});
