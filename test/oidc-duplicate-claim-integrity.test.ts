import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const signingKid = "oidc-duplicate-claim-integrity";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-request-validation",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

let signingPrivateKey: CryptoKey;
let signingPublicJwk: JsonWebKey;

function encodeBytes(bytes: ArrayBuffer | Uint8Array): string {
  return Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");
}

async function signedJwtWithRawJson(headerJson: string, payloadJson: string): Promise<string> {
  const header = Buffer.from(headerJson, "utf8").toString("base64url");
  const payload = Buffer.from(payloadJson, "utf8").toString("base64url");
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingPrivateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  return `${header}.${payload}.${encodeBytes(signature)}`;
}

function canonicalPayload(now: number): Record<string, unknown> {
  return {
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: "295022177",
    repository: "ContextualWisdomLab/.github",
    repository_id: "1274066402",
    job_workflow_ref: configuredWorkflowRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  };
}

async function exchange(token: string): Promise<Response> {
  vi.resetModules();
  const { default: worker } = await import("../src/index");
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.126",
      },
      body: JSON.stringify({ target_repository: 42 }),
    }),
    env,
  );
}

beforeAll(async () => {
  const keyPair = (await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  signingPrivateKey = keyPair.privateKey;
  signingPublicJwk = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("GitHub OIDC duplicate-claim integrity", () => {
  it("rejects an escape-equivalent duplicate top-level payload claim before JWKS egress", async () => {
    const now = Math.floor(Date.now() / 1000);
    const payload = JSON.stringify(canonicalPayload(now)).replace(
      '"repository_owner":"ContextualWisdomLab"',
      '"repository_owner":"OtherOrg","repository_own\\u0065r":"ContextualWisdomLab"',
    );
    const token = await signedJwtWithRawJson(
      JSON.stringify({ alg: "RS256", kid: signingKid, typ: "JWT" }),
      payload,
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === trustedDiscoveryUrl) return Response.json({ jwks_uri: trustedJwksUrl });
      if (url === trustedJwksUrl) {
        return Response.json({ keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }] });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await exchange(token);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects duplicate protected-header authority before JWKS egress", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signedJwtWithRawJson(
      `{"alg":"none","a\\u006cg":"RS256","kid":"${signingKid}","typ":"JWT"}`,
      JSON.stringify(canonicalPayload(now)),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const response = await exchange(token);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
