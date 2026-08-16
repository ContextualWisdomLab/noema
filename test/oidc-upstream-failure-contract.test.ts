import { afterEach, describe, expect, it, vi } from "vitest";

const env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
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
    encodeSegment({ alg: "RS256", kid: "upstream-json-contract" }),
    encodeSegment({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref: "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    }),
    "AA",
  ].join(".");
}

async function exchangeWith(fetchImpl: typeof fetch): Promise<Response> {
  vi.resetModules();
  const { default: worker } = await import("../src/index");
  vi.spyOn(globalThis, "fetch").mockImplementation(fetchImpl);
  return worker.fetch(new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { authorization: `Bearer ${structurallyValidJwt()}` },
  }), env);
}

describe("OIDC upstream document failures", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("classifies malformed discovery JSON as upstream verification failure", async () => {
    const response = await exchangeWith(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return new Response("{", { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document was not valid JSON",
    });
  });

  it("rejects a discovery document whose jwks_uri is not a string", async () => {
    const response = await exchangeWith(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: 7 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document did not include a valid jwks_uri",
    });
  });

  it("rejects a discovery document that redirects JWKS retrieval off the trusted GitHub OIDC origin", async () => {
    const fetchedUrls: string[] = [];
    const response = await exchangeWith(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://attacker.example/.well-known/jwks" });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC discovery document included an untrusted jwks_uri",
    });
    expect(fetchedUrls).toEqual([
      "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
    ]);
  });

  it("classifies malformed JWKS JSON as upstream verification failure", async () => {
    const response = await exchangeWith(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return new Response("{", { status: 200, headers: { "content-type": "application/json" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC JWKS was not valid JSON",
    });
  });

  it("rejects JWKS JSON whose keys member is not an array", async () => {
    const response = await exchangeWith(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: null });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "GitHub OIDC JWKS did not include a valid keys array",
    });
  });
});
