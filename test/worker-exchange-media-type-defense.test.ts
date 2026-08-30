import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

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

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function createSignedJwt() {
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
  const kid = `worker-media-type-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: "295022177",
    repository: "ContextualWisdomLab/.github",
    repository_id: "1274066402",
    job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
    job_workflow_sha: env.ALLOWED_WORKFLOW_SHA,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const publicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    token: `${header}.${payload}.${Buffer.from(signature).toString("base64url")}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

function mockOidc(jwk: JsonWebKey & { kid: string; kty: string }) {
  const requests: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    requests.push(url);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
      return Response.json({ keys: [jwk] });
    }
    return new Response("unexpected GitHub call", { status: 500 });
  });
  return requests;
}

describe("base worker exchange media-type defense", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a misleading media type instead of parsing it as application/json", async () => {
    const { token, jwk } = await createSignedJwt();
    const requests = mockOidc(jwk);

    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/application/json",
      },
      body: JSON.stringify({
        target_repository: { owner: "ContextualWisdomLab", repo: "noema" },
      }),
    }), env);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
    });
    expect(requests.filter((url) => url.includes("api.github.com"))).toHaveLength(0);
  });

  it("rejects a body-bearing request whose media type is missing", async () => {
    const { token, jwk } = await createSignedJwt();
    const requests = mockOidc(jwk);

    const response = await worker.fetch(new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
      },
      body: new TextEncoder().encode(JSON.stringify({
        target_repository: "ContextualWisdomLab/noema",
      })),
    }), env);

    expect(response.status).toBe(415);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      message: "Exchange request body requires application/json",
    });
    expect(requests.filter((url) => url.includes("api.github.com"))).toHaveLength(0);
  });
});
