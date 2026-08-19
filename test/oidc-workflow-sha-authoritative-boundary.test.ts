import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/entrypoint";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const signingKid = "oidc-workflow-sha-authoritative-boundary";
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";

function allowingRateLimitNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => new Response(JSON.stringify({
          allowed: true,
          limit: 1000,
          remaining: 999,
          retry_after_seconds: 0,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

const envWithoutWorkflowSha: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-request-validation",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_RATE_LIMITER: allowingRateLimitNamespace(),
  NOEMA_OIDC_REPLAY_GUARD: {} as DurableObjectNamespace,
};

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

async function exchangeWithAuthoritativeConfig(
  workflowSha: string | undefined,
): Promise<Response> {
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

  const now = Math.floor(Date.now() / 1000);
  const token = await signedJwt({
    iss: envWithoutWorkflowSha.ALLOWED_ISSUER,
    aud: envWithoutWorkflowSha.ALLOWED_AUDIENCE,
    repository_owner: envWithoutWorkflowSha.ALLOWED_REPOSITORY_OWNER,
    repository: "ContextualWisdomLab/.github",
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    job_workflow_ref: configuredWorkflowRef,
    job_workflow_sha: "a".repeat(40),
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });

  vi.resetModules();
  const { default: worker } = await import("../src/entrypoint");
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.124",
      },
      body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab" } }),
    }),
    { ...envWithoutWorkflowSha, ALLOWED_WORKFLOW_SHA: workflowSha },
  );
}

async function expectWorkflowSourceConfigurationFailure(
  workflowSha: string | undefined,
): Promise<void> {
  const response = await exchangeWithAuthoritativeConfig(workflowSha);

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error_code: "ERR_WORKFLOW_NOT_ALLOWED",
    message: "Workflow source trust configuration unavailable",
    details: {
      match_policy: "exact-ref-and-source-sha",
    },
  });
}

describe("authoritative OIDC workflow source configuration", () => {
  it("fails closed when the base exchange worker receives no immutable workflow source SHA", async () => {
    await expectWorkflowSourceConfigurationFailure(undefined);
  });

  it("fails closed when the base exchange worker receives a non-canonical workflow source SHA", async () => {
    await expectWorkflowSourceConfigurationFailure("A".repeat(40));
  });
});
