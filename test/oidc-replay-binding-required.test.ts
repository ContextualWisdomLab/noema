import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredSha = "31e5f5337d8a8d844c456fe03f123c51b62416c9";
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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

async function signedOidcToken() {
  const keyPair = await generateRsaKeyPair();
  const kid = `missing-replay-binding-${crypto.randomUUID()}`;
  const now = Math.floor(Date.now() / 1000);
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: "https://token.actions.githubusercontent.com",
    aud: "cwl-noema-review",
    repository_owner: "ContextualWisdomLab",
    repository_owner_id: expectedRepositoryOwnerId,
    repository: "ContextualWisdomLab/.github",
    repository_id: expectedWorkflowRepositoryId,
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    jti: `missing-replay-binding-${crypto.randomUUID()}`,
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
    token: `${header}.${payload}.${encodeBytes(signature)}`,
    jwk: { ...publicJwk, kid, kty: "RSA" },
  };
}

function namespaceReturning(handler: MockFetch): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return { fetch: handler } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function allowRateLimiter(): DurableObjectNamespace {
  return namespaceReturning(async () =>
    Response.json({ allowed: true, limit: 1000, remaining: 999, retry_after_seconds: 0 }));
}

describe("required OIDC replay authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed before GitHub App token minting when the replay-guard binding is absent", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { token: oidcToken, jwk } = await signedOidcToken();
    const appKeyPair = await generateRsaKeyPair();
    const appPrivateKey = pemFromPkcs8(
      await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
    );
    let tokenMintRequests = 0;

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        tokenMintRequests += 1;
        return Response.json({
          token: "ghs_should_not_mint_without_replay_authority",
          expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        });
      }
      return new Response(`unexpected upstream call ${url} ${init?.method ?? "GET"}`, { status: 500 });
    });

    const env: Env = {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
      ALLOWED_WORKFLOW_SHA: configuredSha,
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      GITHUB_APP_INSTALLATION_ID: "12345",
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      // NOEMA_OIDC_REPLAY_GUARD intentionally omitted: deployment authority is unavailable.
    };

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${oidcToken}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.83",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection unavailable",
    });
    expect(tokenMintRequests).toBe(0);
  });
});
