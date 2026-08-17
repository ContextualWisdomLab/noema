import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function structurallyValidJwt(): string {
  const now = Math.floor(Date.now() / 1000);
  return [
    encodeSegment({ alg: "RS256", kid: "malformed-jwks-key-entry" }),
    encodeSegment({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref:
        "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    }),
    "AA",
  ].join(".");
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("OIDC JWKS key shape", () => {
  it("classifies non-object JWKS key entries as an upstream document failure", async () => {
    vi.resetModules();
    const { default: worker } = await import("../src/index");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [null] });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { authorization: `Bearer ${structurallyValidJwt()}` },
      }),
      env,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC JWKS did not include valid key entries",
    });
  });

  it("classifies incomplete RSA JWKS entries as an upstream document failure", async () => {
    vi.resetModules();
    const { default: worker } = await import("../src/index");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({
          keys: [{ kid: "malformed-jwks-key-entry", kty: "RSA" }],
        });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { authorization: `Bearer ${structurallyValidJwt()}` },
      }),
      env,
    );

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC JWKS did not include valid key entries",
    });
  });
});
