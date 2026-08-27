import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);

let oidcKeyPair: CryptoKeyPair;
let oidcPublicJwk: JsonWebKey;
let appPrivateKeyPem: string;

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

async function generateRsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

beforeAll(async () => {
  oidcKeyPair = await generateRsaKeyPair();
  oidcPublicJwk = await crypto.subtle.exportKey("jwk", oidcKeyPair.publicKey);
  const appKeyPair = await generateRsaKeyPair();
  appPrivateKeyPem = pemFromPkcs8(
    await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

async function signedOidcToken(): Promise<{ token: string; jwk: JsonWebKey }> {
  const kid = `private-key-envelope-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: "https://token.actions.githubusercontent.com",
    aud: "cwl-noema-review",
    repository_owner: "ContextualWisdomLab",
    repository_owner_id: "295022177",
    repository: "ContextualWisdomLab/.github",
    repository_id: "1274066402",
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    oidcKeyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return {
    token: `${header}.${payload}.${encodeBytes(signature)}`,
    jwk: { ...oidcPublicJwk, kid, kty: "RSA" },
  };
}

describe("GitHub App private-key authority", () => {
  it("rejects a valid PKCS#8 key under a non-canonical PEM label before GitHub credential egress", async () => {
    const { token, jwk } = await signedOidcToken();
    const mislabeledPrivateKey = appPrivateKeyPem
      .replace("-----BEGIN PRIVATE KEY-----", "-----BEGIN CERTIFICATE-----")
      .replace("-----END PRIVATE KEY-----", "-----END CERTIFICATE-----");
    const env: Env = {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
      ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: mislabeledPrivateKey,
      GITHUB_APP_INSTALLATION_ID: "92345",
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    };
    let githubCredentialCalls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      githubCredentialCalls += 1;
      if (url === "https://api.github.com/app/installations/92345/access_tokens") {
        return Response.json({
          token: "ghs_should_never_be_minted",
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        });
      }
      return new Response("unexpected GitHub request", { status: 500 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.254",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_API",
      message: "GitHub App private key configuration unavailable",
    });
    expect(githubCredentialCalls).toBe(0);
  });
});
