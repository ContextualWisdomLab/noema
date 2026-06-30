import { describe, expect, it } from "vitest";
import worker, { type Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
};

describe("Noema worker", () => {
  it("reports health", async () => {
    const response = await worker.fetch(new Request("https://noema.example/health"), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, name: "noema" });
  });

  it("returns JSON 404 for unknown routes", async () => {
    const response = await worker.fetch(new Request("https://noema.example/missing"), env);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("rejects non-POST exchange requests", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange"), env);

    expect(response.status).toBe(405);
    await expect(response.json()).resolves.toEqual({ error: "method_not_allowed" });
  });

  it("requires an exchange bearer token", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange", { method: "POST" }), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "missing_bearer_token" });
  });

  it("reports malformed exchange tokens as JSON errors", async () => {
    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: "Bearer malformed" },
    }), env);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: "exchange_failed" });
  });
});
