import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredSha = "e71fdab2ab088001f218765ecb5e3b7fabfee11a";

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Encode one compact-JWT JSON segment for the signed OIDC fixture. */
function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

/** Encode signature bytes with the compact-JWT base64url representation. */
function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

/** Convert a PKCS#8 private key into the PEM form consumed by the GitHub App signer. */
function pemFromPkcs8(pkcs8: ArrayBuffer): string {
  const base64 = Buffer.from(pkcs8).toString("base64");
  const lines = base64.match(/.{1,64}/g)?.join("\n") ?? base64;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

/** Create a real RS256-signed GitHub-Actions-like OIDC token and matching public JWK. */
async function createSignedJwt(payload: Record<string, unknown>) {
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
  const kid = `replay-before-mint-${crypto.randomUUID()}`;
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

/** Build a deterministic Durable Object namespace around one test handler. */
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

/** Return a limiter namespace that always grants the request budget. */
function allowRateLimiter(): DurableObjectNamespace {
  return namespaceReturning(async () =>
    Response.json({ allowed: true, limit: 1000, remaining: 999, retry_after_seconds: 0 }));
}

/** Return a replay namespace that proves this verified jti was already consumed. */
function rejectReplayGuard(): DurableObjectNamespace {
  return namespaceReturning(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Response.json(
      { accepted: false, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
      { status: 409 },
    );
  });
}

/** Return a replay namespace that records the first-use claim before accepting it. */
function acceptReplayGuard(order: string[]): DurableObjectNamespace {
  return namespaceReturning(async (_input, init) => {
    order.push("replay_claim");
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Response.json(
      { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
      { status: 201 },
    );
  });
}

/** Build the production wrapper environment around one replay-guard namespace. */
async function replayTestEnv(replayGuard: DurableObjectNamespace): Promise<{
  env: Env;
  appPrivateKey: string;
}> {
  const appKeyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const appPrivateKey = pemFromPkcs8(
    await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
  );
  return {
    appPrivateKey,
    env: {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
      ALLOWED_WORKFLOW_SHA: configuredSha,
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      NOEMA_OIDC_REPLAY_GUARD: replayGuard,
    },
  };
}

/** Build one valid signed caller identity for the current replay-order contract. */
async function validOidcFixture(jtiPrefix: string) {
  const now = Math.floor(Date.now() / 1000);
  return createSignedJwt({
    iss: "https://token.actions.githubusercontent.com",
    aud: "cwl-noema-review",
    repository_owner: "ContextualWisdomLab",
    repository: "ContextualWisdomLab/.github",
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    jti: `${jtiPrefix}-${crypto.randomUUID()}`,
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
  });
}

/** Build the real exchange request exercised by the production wrapper. */
function exchangeRequest(oidcToken: string, ipAddress: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: `Bearer ${oidcToken}`,
      "content-type": "application/json",
      "cf-connecting-ip": ipAddress,
    },
    body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
  });
}

describe("verified OIDC replay claim ordering", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a verified replay before any GitHub installation-token mint request", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { token: oidcToken, jwk } = await validOidcFixture("replayed");
    const { env } = await replayTestEnv(rejectReplayGuard());
    const upstreamRequests: Array<{ url: string; method: string }> = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      upstreamRequests.push({ url, method: init?.method || "GET" });
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_should_never_be_minted_for_a_replay",
          expires_at: "2026-08-09T12:00:00Z",
        });
      }
      return new Response("unexpected upstream call", { status: 500 });
    });

    const response = await worker.fetch(exchangeRequest(oidcToken, "203.0.113.81"), env);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC token has already been exchanged",
    });
    expect(
      upstreamRequests.filter((request) =>
        request.url === "https://api.github.com/app/installations/12345/access_tokens"),
    ).toHaveLength(0);
  });

  it("claims a verified first use before minting the GitHub installation token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const order: string[] = [];
    const replayGuard = acceptReplayGuard(order);
    const { token: oidcToken, jwk } = await validOidcFixture("first-use");
    const { env } = await replayTestEnv(replayGuard);

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({ jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks" });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        order.push("token_mint");
        return Response.json({
          token: "ghs_first_use_token",
          expires_at: "2026-08-09T12:00:00Z",
        });
      }
      return new Response("unexpected upstream call", { status: 500 });
    });

    const response = await worker.fetch(exchangeRequest(oidcToken, "203.0.113.82"), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-oidc-replay-protection")).toBe("single-use");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        token: "ghs_first_use_token",
        repository: "ContextualWisdomLab/noema",
      },
    });
    expect(order).toEqual(["replay_claim", "token_mint"]);
  });
});
