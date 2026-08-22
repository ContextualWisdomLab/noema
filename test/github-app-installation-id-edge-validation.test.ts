import { describe, expect, it } from "vitest";
import entrypoint, { type Env } from "../src/entrypoint";

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "a".repeat(40),
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "not-used-before-request-edge-validation",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

describe("configured GitHub App installation id at the public request edge", () => {
  it.each([
    "0",
    "-1",
    "1.5",
    "01",
    "9007199254740992",
    "12345/../../repos",
  ])("fails closed before authentication or replay work for invalid id %s", async (installationId) => {
    const response = await entrypoint.fetch(
      new Request("https://noema.example/exchange", { method: "POST" }),
      {
        ...baseEnv,
        GITHUB_APP_INSTALLATION_ID: installationId,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub API trust configuration unavailable",
      details: {
        policy: "github-app-installation-id-canonical",
      },
    });
  });
});
