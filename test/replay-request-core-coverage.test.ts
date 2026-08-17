import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OidcReplayDetected, OidcReplayUnavailable } from "../src/oidc-replay";

const replayClaimMock = vi.hoisted(() => vi.fn());

vi.mock("../src/oidc-replay", async (importActual) => {
  const actual = await importActual<typeof import("../src/oidc-replay")>();
  return {
    ...actual,
    claimOidcTokenUsage: replayClaimMock,
  };
});

import worker, { type Env } from "../src/index";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";

const baseEnv: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

function replayEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...baseEnv,
    NOEMA_OIDC_REPLAY_GUARD: {} as Env["NOEMA_OIDC_REPLAY_GUARD"],
    ...overrides,
  };
}

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
  const kid = `replay-request-${crypto.randomUUID()}`;
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

async function validOidcToken(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return createSignedJwt({
    iss: baseEnv.ALLOWED_ISSUER,
    aud: baseEnv.ALLOWED_AUDIENCE,
    repository_owner: baseEnv.ALLOWED_REPOSITORY_OWNER,
    repository: "ContextualWisdomLab/.github",
    job_workflow_ref: configuredRef,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    jti: "replay-request-jti",
    exp: now + 300,
    nbf: now - 30,
    iat: now - 30,
    ...overrides,
  });
}

function installOidcFetch(jwk: JsonWebKey, env: Env, installationToken = false) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
      return Response.json({
        jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
      });
    }
    if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
      return Response.json({ keys: [jwk] });
    }
    if (installationToken && url === `${env.GITHUB_API_BASE}/repos/ContextualWisdomLab/noema/installation`) {
      return Response.json({ id: 12345 });
    }
    if (installationToken && url === `${env.GITHUB_API_BASE}/app/installations/12345/access_tokens`) {
      return Response.json({
        token: "ghs_replay_coverage_token",
        expires_at: "2030-01-01T00:00:00Z",
      });
    }
    return new Response("not found", { status: 404 });
  });
}

async function exchange(token: string, env: Env, ip: string) {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "cf-connecting-ip": ip,
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    env,
  );
}

beforeEach(() => {
  replayClaimMock.mockReset();
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("replay request core through the public worker", () => {
  it("fails closed before token mint when replay-required claims omit jti", async () => {
    const { token, jwk } = await validOidcToken({ jti: undefined });
    const env = replayEnv();
    installOidcFetch(jwk, env);

    const response = await exchange(token, env, "203.0.113.211");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection claims unavailable",
      details: { replay_protection: "distributed-single-use" },
    });
    expect(replayClaimMock).not.toHaveBeenCalled();
  });

  it("marks a successful atomic replay claim before minting the installation token", async () => {
    const { token, jwk } = await validOidcToken({ jti: "replay-success-jti" });
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
    const env = replayEnv({
      GITHUB_APP_PRIVATE_KEY_PEM: pemFromPkcs8(
        await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
      ),
    });
    replayClaimMock.mockResolvedValue({
      accepted: true,
      expires_at_epoch_seconds: Math.floor(Date.now() / 1000) + 300,
    });
    installOidcFetch(jwk, env, true);

    const response = await exchange(token, env, "203.0.113.212");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-oidc-replay-protection")).toBe("verified-before-mint");
    expect(replayClaimMock).toHaveBeenCalledOnce();
    expect(replayClaimMock.mock.calls[0]?.[0]).toBe("replay-success-jti");
  });

  it("classifies an atomic replay decision as authentication failure", async () => {
    const { token, jwk } = await validOidcToken({ jti: "replayed-jti" });
    const env = replayEnv();
    replayClaimMock.mockRejectedValue(new OidcReplayDetected(Math.floor(Date.now() / 1000) + 300));
    installOidcFetch(jwk, env);

    const response = await exchange(token, env, "203.0.113.213");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC token has already been exchanged",
      details: { replay_protection: "distributed-single-use" },
    });
  });

  it("classifies replay authority unavailability as fail-closed service failure", async () => {
    const { token, jwk } = await validOidcToken({ jti: "replay-unavailable-jti" });
    const env = replayEnv();
    replayClaimMock.mockRejectedValue(new OidcReplayUnavailable("durable object unavailable"));
    installOidcFetch(jwk, env);

    const response = await exchange(token, env, "203.0.113.214");

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection unavailable",
      details: { replay_protection: "distributed-single-use" },
    });
  });

  it("does not misclassify an unexpected replay implementation failure", async () => {
    const { token, jwk } = await validOidcToken({ jti: "replay-internal-jti" });
    const env = replayEnv();
    replayClaimMock.mockRejectedValue(new Error("unexpected replay implementation failure"));
    installOidcFetch(jwk, env);

    const response = await exchange(token, env, "203.0.113.215");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_INTERNAL",
      message: "Internal server error",
    });
  });
});
