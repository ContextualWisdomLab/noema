import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-request-validation",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function createSignedJwt(repository: string) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const kid = `credential-request-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository,
    job_workflow_ref: configuredRef,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  };
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const body = encodeSegment(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${body}`),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${body}.${encodeBytes(signature)}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

function mockOidcDiscovery(jwk: JsonWebKey & { kid: string; kty: string }) {
  const upstream = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({
        jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
      });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
      return Response.json({ keys: [jwk] });
    }
    return new Response("unexpected privileged egress", { status: 500 });
  });
  return upstream;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("credential request helper coverage through the public worker", () => {
  it("rejects malformed JSON after verified OIDC without reaching GitHub App egress", async () => {
    const { token, jwk } = await createSignedJwt("ContextualWisdomLab/.github");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.101",
        },
        body: "{",
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Malformed JSON request body",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it("treats a non-object JSON body as empty before repository syntax validation", async () => {
    const { token, jwk } = await createSignedJwt("invalid-repository-name");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.102",
        },
        body: "null",
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it("treats a truthy primitive JSON body as empty before repository syntax validation", async () => {
    const { token, jwk } = await createSignedJwt("invalid-repository-name");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.106",
        },
        body: "7",
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it("treats a non-JSON body as empty before repository syntax validation", async () => {
    const { token, jwk } = await createSignedJwt("invalid-repository-name");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "text/plain",
          "cf-connecting-ip": "203.0.113.103",
        },
        body: "ignored",
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it("treats a missing content type as a non-JSON body without privileged egress", async () => {
    const { token, jwk } = await createSignedJwt("invalid-repository-name");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "cf-connecting-ip": "203.0.113.107",
        },
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it("rejects a syntactically valid repository owned outside the configured organization", async () => {
    const { token, jwk } = await createSignedJwt("ContextualWisdomLab/.github");
    const upstream = mockOidcDiscovery(jwk);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.104",
        },
        body: JSON.stringify({ target_repository: "OtherWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
      message: "target_repository owner is not allowed",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
  });

  it.each([
    ["name parent segment", "ContextualWisdomLab/.."],
    ["name current segment", "ContextualWisdomLab/."],
    ["owner parent segment", "../noema"],
    ["owner current segment", "./noema"],
    ["percent-encoded parent name", "ContextualWisdomLab/%2e%2e"],
    ["uppercase percent-encoded parent name", "ContextualWisdomLab/%2E%2E"],
    ["extra path segment", "ContextualWisdomLab/noema/extra"],
    ["empty name after slash", "ContextualWisdomLab/"],
    ["double slash", "ContextualWisdomLab//noema"],
    ["backslash separator", "ContextualWisdomLab\\noema"],
    ["unicode one-dot-leader name", "ContextualWisdomLab/\u2024\u2024"],
    ["unicode fullwidth-dot name", "ContextualWisdomLab/\uFF0E\uFF0E"],
  ])("rejects repository URL %s before GitHub App credential work", async (_label, targetRepository) => {
    const { token, jwk } = await createSignedJwt("ContextualWisdomLab/.github");
    const upstream = mockOidcDiscovery(jwk);
    const importKey = vi.spyOn(crypto.subtle, "importKey");

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.105",
        },
        body: JSON.stringify({ target_repository: targetRepository }),
      }),
      env,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "target_repository is not a valid owner/name repository",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
    expect(importKey.mock.calls.filter(([format]) => format === "pkcs8")).toHaveLength(0);
  });

  it("allows the real .github repository name and only then imports the GitHub App private key", async () => {
    const { token, jwk } = await createSignedJwt("ContextualWisdomLab/.github");
    const upstream = mockOidcDiscovery(jwk);
    const importKey = vi.spyOn(crypto.subtle, "importKey");

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.108",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/.github" }),
      }),
      env,
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_INTERNAL",
    });
    expect(
      upstream.mock.calls.filter(([input]) => String(input).startsWith("https://api.github.com/")),
    ).toHaveLength(0);
    expect(importKey.mock.calls.filter(([format]) => format === "pkcs8").length).toBeGreaterThan(0);
  });
});
