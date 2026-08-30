import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/index";

const configuredWorkflowRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredWorkflowSha = "a".repeat(40);
const expectedRepositoryOwnerId = "295022177";
const expectedWorkflowRepositoryId = "1274066402";

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
  NOEMA_OIDC_JWKS_CACHE_TTL_SECONDS: "1",
};

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function encodeBytes(bytes: ArrayBuffer): string {
  return Buffer.from(bytes).toString("base64url");
}

async function createSignedJwt(nowEpochSeconds: number) {
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
  const kid = `jwks-cache-expiry-${crypto.randomUUID()}`;
  const header = encodeSegment({ alg: "RS256", kid, typ: "JWT" });
  const payload = encodeSegment({
    iss: env.ALLOWED_ISSUER,
    aud: env.ALLOWED_AUDIENCE,
    repository_owner: env.ALLOWED_REPOSITORY_OWNER,
    repository_owner_id: expectedRepositoryOwnerId,
    repository: "ContextualWisdomLab/.github",
    repository_id: expectedWorkflowRepositoryId,
    job_workflow_ref: configuredWorkflowRef,
    job_workflow_sha: configuredWorkflowSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    exp: nowEpochSeconds + 300,
    nbf: nowEpochSeconds - 30,
    iat: nowEpochSeconds - 30,
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

function exchangeRequest(token: string): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.120",
    },
    body: JSON.stringify({
      target_repository: { owner: "ContextualWisdomLab", repo: "noema" },
    }),
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("OIDC JWKS cache expiry", () => {
  it("reuses a fresh cached JWKS without repeating discovery or key-set egress", async () => {
    vi.resetModules();
    const fixedNowMs = Date.now() + 86_400_000;
    vi.spyOn(Date, "now").mockReturnValue(fixedNowMs);
    const { default: worker } = await import("../src/index");
    const { token, jwk } = await createSignedJwt(Math.floor(fixedNowMs / 1000));
    const fetchedUrls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await worker.fetch(exchangeRequest(token), env);
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_VALIDATION_INPUT",
        details: { field: "target_repository" },
      });
    }

    expect(
      fetchedUrls.filter(
        (url) => url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
      ),
    ).toHaveLength(1);
    expect(
      fetchedUrls.filter(
        (url) => url === "https://token.actions.githubusercontent.com/.well-known/jwks",
      ),
    ).toHaveLength(1);
    expect(fetchedUrls.every((url) => url.startsWith("https://token.actions.githubusercontent.com/"))).toBe(true);
  });

  it("refetches GitHub discovery and JWKS after the configured cache TTL expires", async () => {
    vi.resetModules();
    const initialNowMs = Date.now() + 86_400_000;
    const dateNow = vi.spyOn(Date, "now").mockReturnValue(initialNowMs);
    const { default: worker } = await import("../src/index");
    const { token, jwk } = await createSignedJwt(Math.floor(initialNowMs / 1000));
    const fetchedUrls: string[] = [];

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      fetchedUrls.push(url);
      if (url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration") {
        return Response.json({
          jwks_uri: "https://token.actions.githubusercontent.com/.well-known/jwks",
        });
      }
      if (url === "https://token.actions.githubusercontent.com/.well-known/jwks") {
        return Response.json({ keys: [jwk] });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });

    const firstResponse = await worker.fetch(exchangeRequest(token), env);
    expect(firstResponse.status).toBe(400);
    await expect(firstResponse.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: { field: "target_repository" },
    });

    dateNow.mockReturnValue(initialNowMs + 2_000);
    const secondResponse = await worker.fetch(exchangeRequest(token), env);
    expect(secondResponse.status).toBe(400);
    await expect(secondResponse.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_VALIDATION_INPUT",
      details: { field: "target_repository" },
    });

    expect(
      fetchedUrls.filter(
        (url) => url === "https://token.actions.githubusercontent.com/.well-known/openid-configuration",
      ),
    ).toHaveLength(2);
    expect(
      fetchedUrls.filter(
        (url) => url === "https://token.actions.githubusercontent.com/.well-known/jwks",
      ),
    ).toHaveLength(2);
    expect(fetchedUrls.every((url) => url.startsWith("https://token.actions.githubusercontent.com/"))).toBe(true);
  });
});
