import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const signingKid = "oidc-numeric-date-finite";

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

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signedRawPayloadJwt(payloadJson: string): Promise<string> {
  const encodedHeader = encodeJson({ alg: "RS256", kid: signingKid });
  const encodedPayload = Buffer.from(payloadJson).toString("base64url");
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signingPrivateKey,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    ),
  );
  return `${encodedHeader}.${encodedPayload}.${encodeBytes(signature)}`;
}

function rawClaimsWithNumericDate(
  field: "exp" | "nbf" | "iat",
  rawNumericDate: string,
  now = Math.floor(Date.now() / 1000),
): string {
  const claims: Record<string, unknown> = {
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository: "ContextualWisdomLab/.github",
    job_workflow_ref: configuredWorkflowRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  };
  const finiteValue = claims[field];
  const encoded = JSON.stringify(claims);
  return encoded.replace(`"${field}":${finiteValue}`, `"${field}":${rawNumericDate}`);
}

async function exchange(token: string): Promise<Response> {
  vi.resetModules();
  const { default: worker } = await import("../src/index");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === trustedDiscoveryUrl) return Response.json({ jwks_uri: trustedJwksUrl });
    if (url === trustedJwksUrl) {
      return Response.json({ keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }] });
    }
    return new Response("unexpected privileged egress", { status: 500 });
  });

  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.122",
      },
      body: JSON.stringify({
        target_repository: { owner: "ContextualWisdomLab", repo: "noema" },
      }),
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

describe("OIDC NumericDate finiteness", () => {
  it("rejects a signed expiration that overflows JSON numeric range instead of treating Infinity as unexpired", async () => {
    const token = await signedRawPayloadJwt(rawClaimsWithNumericDate("exp", "1e400"));
    const response = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
    });
  });

  it("rejects a signed negative not-before overflow instead of treating negative Infinity as already valid", async () => {
    const token = await signedRawPayloadJwt(rawClaimsWithNumericDate("nbf", "-1e400"));
    const response = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
    });
  });

  it("rejects a signed issued-at value that overflows JSON numeric range", async () => {
    const token = await signedRawPayloadJwt(rawClaimsWithNumericDate("iat", "1e400"));
    const response = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
    });
  });

  it("rejects a signed issued-at value that is materially in the future", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signedRawPayloadJwt(rawClaimsWithNumericDate("iat", String(now + 300), now));
    const response = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
    });
  });
});
