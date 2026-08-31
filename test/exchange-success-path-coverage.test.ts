import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

/** Build a deterministic Durable Object namespace around one test handler. */
function namespaceReturning(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return { fetch: handler } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

/** Return a replay-guard namespace that accepts every claim, as a real first-use would. */
function acceptingReplayGuard(): DurableObjectNamespace {
  return namespaceReturning(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    return Response.json(
      { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
      { status: 201 },
    );
  });
}

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredWorkflowSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_OIDC_REPLAY_GUARD: acceptingReplayGuard(),
};

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
  const kid = `exchange-success-${crypto.randomUUID()}`;
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exchange success-path coverage through the public worker", () => {
  it.each([
    "https://api.github.com",
    "https://api.github.com/",
    "https://api.github.com:443/",
  ])("accepts workflow_ref-only claims with GitHub API base %s", async (githubApiBase) => {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const oidcSubject = "repo:ContextualWisdomLab/.github:ref:refs/heads/main";
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository_owner_id: expectedRepositoryOwnerId,
      repository: "ContextualWisdomLab/.github",
      repository_id: expectedWorkflowRepositoryId,
      workflow_ref: configuredRef,
      workflow_sha: configuredWorkflowSha,
      sub: oidcSubject,
      jti: crypto.randomUUID(),
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
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
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

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
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_exchange_success_token",
          expires_at: expiresAt,
        }, { status: 201 });
      }
      return new Response("not found", { status: 404 });
    });

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${oidcToken}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.205",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      {
        ...env,
        GITHUB_API_BASE: githubApiBase,
        GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        token: "ghs_exchange_success_token",
        repository: "ContextualWisdomLab/noema",
        workflow_ref: configuredRef,
        token_expires_at: expiresAt,
      },
    });
    const logOutput = logSpy.mock.calls.flat().join("\n");
    expect(logOutput).not.toContain("ghs_exchange_success_token");
    expect(logOutput).not.toContain(oidcToken);
    expect(logOutput).not.toContain(oidcSubject);
    expect(logOutput).toMatch(/"oidc_sub":"[0-9a-f]{32}"/);
    expect(logOutput).toMatch(/"replay_protected":true/);
  });

  it("fails closed with 503 ERR_AUTH_REPLAY when the replay-guard binding is absent, even for an otherwise-valid exchange", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token: oidcToken, jwk } = await createSignedJwt({
      iss: env.ALLOWED_ISSUER,
      aud: env.ALLOWED_AUDIENCE,
      repository_owner: env.ALLOWED_REPOSITORY_OWNER,
      repository_owner_id: expectedRepositoryOwnerId,
      repository: "ContextualWisdomLab/.github",
      repository_id: expectedWorkflowRepositoryId,
      workflow_ref: configuredRef,
      workflow_sha: configuredWorkflowSha,
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
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
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const upstreamRequests: Array<{ url: string; method: string }> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      upstreamRequests.push({ url, method: init?.method || "GET" });
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      if (url === "https://api.github.com/repos/ContextualWisdomLab/noema/installation") {
        return Response.json({ id: 12345 });
      }
      if (url === "https://api.github.com/app/installations/12345/access_tokens") {
        return Response.json({
          token: "ghs_should_never_be_minted_without_replay_guard",
          expires_at: new Date(Date.now() + 60 * 60_000).toISOString(),
        }, { status: 201 });
      }
      return new Response("not found", { status: 404 });
    });

    // Deliberately omit NOEMA_OIDC_REPLAY_GUARD from the env passed to the base
    // module: this is the exact scenario the fail-open bug allowed through.
    const { NOEMA_OIDC_REPLAY_GUARD: _omitted, ...envWithoutReplayGuard } = env;

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${oidcToken}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.205",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      {
        ...envWithoutReplayGuard,
        GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      },
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
    });
    expect(
      upstreamRequests.filter((request) =>
        request.url === "https://api.github.com/app/installations/12345/access_tokens"),
    ).toHaveLength(0);
  });
});