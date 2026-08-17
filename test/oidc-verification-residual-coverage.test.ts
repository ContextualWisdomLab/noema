import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const trustedDiscoveryUrl =
  "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const trustedJwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
const signingKid = "oidc-residual-coverage";

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredWorkflowRef,
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

function baseClaims(now = Math.floor(Date.now() / 1000)): Record<string, unknown> {
  return {
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository: "ContextualWisdomLab/.github",
    job_workflow_ref: configuredWorkflowRef,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  };
}

async function signedJwt(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: signingKid },
  corruptSignature = false,
): Promise<string> {
  const encodedHeader = encodeJson(header);
  const encodedPayload = encodeJson(payload);
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      signingPrivateKey,
      new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
    ),
  );
  if (corruptSignature) signature[0] ^= 1;
  return `${encodedHeader}.${encodedPayload}.${encodeBytes(signature)}`;
}

async function exchange(
  token: string,
  fetchImpl?: typeof fetch,
  runtimeEnv: Env = env,
): Promise<{ response: Response; fetchedUrls: string[] }> {
  vi.resetModules();
  const { default: worker } = await import("../src/index");
  const fetchedUrls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    fetchedUrls.push(url);
    if (fetchImpl) return fetchImpl(input, init);
    if (url === trustedDiscoveryUrl) return Response.json({ jwks_uri: trustedJwksUrl });
    if (url === trustedJwksUrl) {
      return Response.json({ keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }] });
    }
    return new Response("unexpected privileged egress", { status: 500 });
  });

  const response = await worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": "203.0.113.121",
      },
      body: JSON.stringify({
        target_repository: { owner: "ContextualWisdomLab", repo: "noema" },
      }),
    }),
    runtimeEnv,
  );
  return { response, fetchedUrls };
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

describe("OIDC verification residual coverage", () => {
  it("accepts an audience array and workflow_ref fallback without nbf", async () => {
    const claims = baseClaims();
    claims.aud = ["unrelated-audience", env.ALLOWED_AUDIENCE];
    delete claims.job_workflow_ref;
    claims.workflow_ref = configuredWorkflowRef;
    delete claims.nbf;

    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: { field: "target_repository" },
    });
  });

  it("rejects RS256 headers without a kid before OIDC network access", async () => {
    const token = await signedJwt(baseClaims(), { alg: "RS256" });
    const { response, fetchedUrls } = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
    });
    expect(fetchedUrls).toEqual([]);
  });

  it("rejects a non-RS256 header before OIDC network access", async () => {
    const token = await signedJwt(baseClaims(), { alg: "HS256", kid: signingKid });
    const { response, fetchedUrls } = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      message: "OIDC token header is not acceptable",
    });
    expect(fetchedUrls).toEqual([]);
  });

  it("rejects matching-kid non-RSA keys after one forced JWKS refresh", async () => {
    const token = await signedJwt(baseClaims());
    const { response, fetchedUrls } = await exchange(token, async (input) => {
      const url = String(input);
      if (url === trustedDiscoveryUrl) return Response.json({ jwks_uri: trustedJwksUrl });
      if (url === trustedJwksUrl) {
        return Response.json({
          keys: [{ ...signingPublicJwk, kid: signingKid, kty: "EC" }],
        });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "OIDC signing key was not found",
    });
    expect(fetchedUrls.filter((url) => url === trustedJwksUrl)).toHaveLength(2);
  });

  it("rejects a token whose signature does not verify", async () => {
    const token = await signedJwt(baseClaims(), undefined, true);
    const { response } = await exchange(token);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "OIDC signature verification failed",
    });
  });

  it("rejects a token from an untrusted issuer", async () => {
    const claims = baseClaims();
    claims.iss = "https://issuer.example.invalid";
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
      message: "OIDC issuer is not allowed",
    });
  });

  it("rejects a token whose audience does not include Noema", async () => {
    const claims = baseClaims();
    claims.aud = "different-audience";
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
      message: "OIDC audience is not allowed",
    });
  });

  it("rejects a token from a different repository owner", async () => {
    const claims = baseClaims();
    claims.repository_owner = "OtherOwner";
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
      message: "OIDC repository owner is not allowed",
    });
  });

  it("rejects a future not-before claim after successful signature verification", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = baseClaims(now);
    claims.nbf = now + 120;
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
      message: "OIDC token is not valid yet",
    });
  });

  it("rejects a token without a numeric expiration", async () => {
    const claims = baseClaims();
    delete claims.exp;
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
      message: "OIDC token is expired",
    });
  });

  it("rejects a numerically expired token", async () => {
    const now = Math.floor(Date.now() / 1000);
    const claims = baseClaims(now);
    claims.exp = now - 120;
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_INVALID",
      message: "OIDC token is expired",
    });
  });

  it("rejects a token with no workflow reference using the empty fallback", async () => {
    const claims = baseClaims();
    delete claims.job_workflow_ref;
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow_ref is not allowed",
    });
  });

  it("rejects a workflow reference outside the configured prefix", async () => {
    const claims = baseClaims();
    claims.job_workflow_ref =
      "ContextualWisdomLab/.github/.github/workflows/another.yml@refs/heads/main";
    const { response } = await exchange(await signedJwt(claims));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow_ref is not allowed",
    });
  });

  it("classifies malformed payload JSON as a malformed token before upstream access", async () => {
    const encodedHeader = encodeJson({ alg: "RS256", kid: signingKid });
    const malformedPayload = Buffer.from("{").toString("base64url");
    const token = `${encodedHeader}.${malformedPayload}.AA`;
    const { response, fetchedUrls } = await exchange(token);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_TOKEN_MALFORMED",
      message: "OIDC token is malformed",
    });
    expect(fetchedUrls).toEqual([]);
  });

  it("fails closed when the crypto verifier raises an unexpected runtime error", async () => {
    const token = await signedJwt(baseClaims());
    const verifySpy = vi
      .spyOn(globalThis.crypto.subtle, "verify")
      .mockRejectedValueOnce(new Error("verification backend unavailable"));

    const { response } = await exchange(token);

    expect(verifySpy).toHaveBeenCalledOnce();
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_OIDC_VERIFICATION",
      message: "OIDC token verification failed",
    });
  });

  it("rejects a workflow that passes the configured prefix but belongs to another workflow repository", async () => {
    const otherWorkflowRef =
      "OtherOrg/central/.github/workflows/noema-review.yml@refs/heads/main";
    const claims = baseClaims();
    claims.job_workflow_ref = otherWorkflowRef;
    const runtimeEnv = {
      ...env,
      ALLOWED_WORKFLOW_REF_PREFIX: otherWorkflowRef,
    };
    const { response } = await exchange(await signedJwt(claims), undefined, runtimeEnv);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow repository is not allowed",
    });
  });
});
