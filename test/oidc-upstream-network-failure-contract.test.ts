import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

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

function tokenFor(kid: string): string {
  return [
    encodeSegment({ alg: "RS256", kid }),
    encodeSegment({}),
    Buffer.from("signature").toString("base64url"),
  ].join(".");
}

async function exchange(token: string): Promise<Response> {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }),
    env,
  );
}

describe("OIDC upstream network failure classification", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies discovery transport rejection as an upstream 502", async () => {
    const kid = `discovery-network-${crypto.randomUUID()}`;
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("network unavailable"));

    const response = await exchange(tokenFor(kid));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
    });
  });

  it("classifies JWKS transport rejection as an upstream 502", async () => {
    const kid = `jwks-network-${crypto.randomUUID()}`;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        throw new TypeError("network unavailable");
      }
      return new Response("unexpected upstream call", { status: 500 });
    });

    const response = await exchange(tokenFor(kid));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
    });
  });
});
