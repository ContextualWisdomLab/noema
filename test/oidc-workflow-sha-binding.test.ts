import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/runtime-entrypoint";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const signingKid = "oidc-workflow-sha-binding";
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

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

function unsignedJwt(payload: unknown): string {
  return `${encodeJson({})}.${encodeJson(payload)}.eA`;
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

async function exchangeWithToken(
  token: string,
  overrides: Partial<Env> = {},
): Promise<Response> {
  vi.resetModules();
  const { default: worker } = await import("../src/runtime-entrypoint");
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.123",
      },
      body: JSON.stringify({ target_repository: { owner: "ContextualWisdomLab" } }),
    }),
    { ...env, ...overrides },
  );
}

async function exchangeWithTrustedOidc(
  token: string,
  overrides: Partial<Env> = {},
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
  return exchangeWithToken(token, overrides);
}

async function exchangeWithClaims(claims: Record<string, unknown>): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signedJwt({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: expectedRepositoryOwnerId,
    repository: "ContextualWisdomLab/.github",
    repository_id: expectedWorkflowRepositoryId,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    ...claims,
  });
  return exchangeWithToken(token);
}

async function trustedExchangeWithClaims(
  claims: Record<string, unknown>,
  overrides: Partial<Env> = {},
): Promise<Response> {
  const now = Math.floor(Date.now() / 1000);
  const token = await signedJwt({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: expectedRepositoryOwnerId,
    repository: "ContextualWisdomLab/.github",
    repository_id: expectedWorkflowRepositoryId,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    ...claims,
  });
  return exchangeWithTrustedOidc(token, overrides);
}

async function exchangeWithWorkflowSha(jobWorkflowSha?: string): Promise<Response> {
  return trustedExchangeWithClaims({
    job_workflow_ref: configuredWorkflowRef,
    ...(jobWorkflowSha === undefined ? {} : { job_workflow_sha: jobWorkflowSha }),
  });
}

async function expectDelegatedMalformedToken(
  token: string,
  expectedStatus: 400 | 401,
): Promise<void> {
  const response = await exchangeWithToken(token);
  expect(response.status).toBe(expectedStatus);
  await expect(response.json()).resolves.toMatchObject({
    ok: false,
    error_code: "ERR_TOKEN_MALFORMED",
  });
}

describe("production OIDC reusable-workflow source identity", () => {
  it("rejects a signed token whose job_workflow_sha differs from the configured immutable workflow source", async () => {
    const response = await exchangeWithWorkflowSha("b".repeat(40));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow source revision is not allowed",
      details: {
        match_policy: "exact-ref-and-source-sha",
      },
    });
  });

  it("rejects a signed reusable-workflow token that omits job_workflow_sha", async () => {
    const response = await exchangeWithWorkflowSha();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow source revision is not allowed",
      details: {
        match_policy: "exact-ref-and-source-sha",
      },
    });
  });

  it("binds the fallback workflow_ref identity to its workflow_sha instead of bypassing immutable source policy", async () => {
    const response = await trustedExchangeWithClaims({
      workflow_ref: configuredWorkflowRef,
      workflow_sha: "b".repeat(40),
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow source revision is not allowed",
      details: {
        match_policy: "exact-ref-and-source-sha",
      },
    });
  });

  it.each([
    ["reusable", { job_workflow_ref: configuredWorkflowRef, job_workflow_sha: configuredWorkflowSha }],
    ["direct", { workflow_ref: configuredWorkflowRef, workflow_sha: configuredWorkflowSha }],
  ] as const)(
    "accepts a correctly signed exact %s workflow source pair through the authoritative verifier",
    async (_identityKind, workflowClaims) => {
      const response = await trustedExchangeWithClaims(workflowClaims);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_VALIDATION_INPUT",
        details: {
          field: "target_repository",
        },
      });
    },
  );

  it.each([undefined, "", "A".repeat(40)])(
    "fails closed when the immutable workflow source configuration is unusable (%s)",
    async (configuredSha) => {
      const response = await trustedExchangeWithClaims(
        {
          job_workflow_ref: configuredWorkflowRef,
          job_workflow_sha: configuredWorkflowSha,
        },
        { ALLOWED_WORKFLOW_SHA: configuredSha },
      );

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_WORKFLOW_NOT_ALLOWED",
        message: "Workflow source trust configuration unavailable",
        details: {
          match_policy: "exact-ref-and-source-sha",
        },
      });
    },
  );

  it("allows an exact reusable-workflow source pair through to the authoritative verifier", async () => {
    await expectDelegatedMalformedToken(
      unsignedJwt({
        job_workflow_ref: configuredWorkflowRef,
        job_workflow_sha: configuredWorkflowSha,
      }),
      401,
    );
  });

  it("allows an exact fallback workflow source pair through to the authoritative verifier", async () => {
    await expectDelegatedMalformedToken(
      unsignedJwt({
        workflow_ref: configuredWorkflowRef,
        workflow_sha: configuredWorkflowSha,
      }),
      401,
    );
  });

  it("rejects an unrelated workflow identity at the denial-only exact-ref boundary", async () => {
    const response = await exchangeWithToken(
      unsignedJwt({
        job_workflow_ref:
          "ContextualWisdomLab/.github/.github/workflows/other.yml@refs/heads/main",
        job_workflow_sha: "b".repeat(40),
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow_ref is not allowed",
      details: {
        match_policy: "exact",
        hint: expect.stringContaining("prefix-sharing refs are rejected"),
      },
    });
  });

  it("leaves claims without a usable workflow ref to the authoritative verifier", async () => {
    await expectDelegatedMalformedToken(
      unsignedJwt({
        job_workflow_ref: 42,
        workflow_ref: null,
        job_workflow_sha: configuredWorkflowSha,
      }),
      401,
    );
  });

  it("leaves decoded non-object claims to the bounded authoritative token parser", async () => {
    for (const claims of [null, "not-an-object"] as const) {
      const response = await exchangeWithToken(unsignedJwt(claims));
      expect([400, 401]).toContain(response.status);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_TOKEN_MALFORMED",
      });
    }
  });

  it("delegates absent exact workflow-ref configuration to the hardened workflow-trust boundary", async () => {
    const response = await exchangeWithToken(
      unsignedJwt({
        job_workflow_ref: configuredWorkflowRef,
        job_workflow_sha: configuredWorkflowSha,
      }),
      { ALLOWED_WORKFLOW_REF_PREFIX: undefined },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
      details: {
        match_policy: "exact",
      },
    });
  });

  it("leaves malformed decoded claims to the bounded authoritative token parser", async () => {
    await expectDelegatedMalformedToken("e30.eA.eA", 400);
    await expectDelegatedMalformedToken("e30.e30", 401);
    await expectDelegatedMalformedToken(`e30.${encodeJson([])}.eA`, 401);
  });

  it("does not decode a source-policy payload above the bounded JWT payload limit", async () => {
    const oversizedPayload = Buffer.alloc(6_145).toString("base64url");
    expect(oversizedPayload.length).toBeGreaterThan(8_192);
    await expectDelegatedMalformedToken(`e30.${oversizedPayload}.eA`, 400);
  });
});
