import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const signingKid = "oidc-workflow-sha-cryptographic";
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";
const base64UrlAlphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const env = {
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
} satisfies Env & { ALLOWED_WORKFLOW_SHA: string };

let signingPrivateKey: CryptoKey;
let signingPublicJwk: JsonWebKey;

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(value: Uint8Array): string {
  return Buffer.from(value).toString("base64url");
}

async function signedJwt(payload: Record<string, unknown>): Promise<string> {
  const encodedHeader = encodeJson({ alg: "RS256", kid: signingKid });
  const encodedPayload = encodeJson(payload);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signingPrivateKey,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    ),
  );
  return `${encodedHeader}.${encodedPayload}.${encodeBytes(signature)}`;
}

function nonCanonicalSignatureAlias(token: string): string {
  const parts = token.split(".");
  const signature = parts[2];
  const lastCharacter = signature.at(-1);
  if (!lastCharacter) throw new Error("expected JWT signature segment");
  const lastIndex = base64UrlAlphabet.indexOf(lastCharacter);
  if (lastIndex < 0 || lastIndex % 16 !== 0 || lastIndex + 1 >= base64UrlAlphabet.length) {
    throw new Error("expected canonical one-byte-tail base64url signature");
  }
  const aliasedSignature = `${signature.slice(0, -1)}${base64UrlAlphabet[lastIndex + 1]}`;
  if (!Buffer.from(signature, "base64url").equals(Buffer.from(aliasedSignature, "base64url"))) {
    throw new Error("expected non-canonical signature alias to decode to identical bytes");
  }
  return `${parts[0]}.${parts[1]}.${aliasedSignature}`;
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

describe("cryptographic OIDC workflow source identity", () => {
  it("rejects a signed reusable-workflow SHA mismatch at the authoritative verifier", async () => {
    const now = Math.floor(Date.now() / 1000);
    const token = await signedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository_owner_id: expectedRepositoryOwnerId,
      repository: "ContextualWisdomLab/.github",
      repository_id: expectedWorkflowRepositoryId,
      job_workflow_ref: configuredWorkflowRef,
      job_workflow_sha: "b".repeat(40),
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });

    vi.resetModules();
    const { default: worker } = await import("../src/index");
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === trustedDiscoveryUrl) {
        return Response.json({ jwks_uri: trustedJwksUrl });
      }
      if (url === trustedJwksUrl) {
        return Response.json({
          keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }],
        });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.125",
        },
        body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab" } }),
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow source revision is not allowed",
    });
  });

  it("rejects a signature segment whose non-canonical tail bits decode to the signed bytes at the bearer boundary", async () => {
    const now = Math.floor(Date.now() / 1000);
    const canonicalToken = await signedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository_owner_id: expectedRepositoryOwnerId,
      repository: "ContextualWisdomLab/.github",
      repository_id: expectedWorkflowRepositoryId,
      job_workflow_ref: configuredWorkflowRef,
      job_workflow_sha: configuredWorkflowSha,
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const aliasedToken = nonCanonicalSignatureAlias(canonicalToken);

    vi.resetModules();
    const { default: worker } = await import("../src/index");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === trustedDiscoveryUrl) {
        return Response.json({ jwks_uri: trustedJwksUrl });
      }
      if (url === trustedJwksUrl) {
        return Response.json({
          keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }],
        });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${aliasedToken}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.126",
        },
        body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab" } }),
      }),
      env,
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_MISSING",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
