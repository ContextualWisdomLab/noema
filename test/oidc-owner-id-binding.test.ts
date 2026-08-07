import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/index";
import {
  evaluateRuntimeReadiness,
  type RuntimeReadinessEnv,
} from "../src/runtime-readiness";

const ownerId = "295022177";

function dummyNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => new Response("unused", { status: 500 }),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
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

async function signingKeyPair(): Promise<CryptoKeyPair> {
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

async function signedOidcToken(payload: Record<string, unknown>) {
  const keyPair = await signingKeyPair();
  const kid = `owner-id-test-${crypto.randomUUID()}`;
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

async function readinessEnv(): Promise<RuntimeReadinessEnv> {
  const appKeyPair = await signingKeyPair();
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX:
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PEM: pemFromPkcs8(
      await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
    ),
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

describe("immutable GitHub organization identity binding", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("treats a missing immutable repository-owner id as not ready", async () => {
    const result = await evaluateRuntimeReadiness(await readinessEnv());

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("allowed_repository_owner_id");
  });

  it("rejects a validly signed OIDC token when the owner name matches but owner id does not", async () => {
    const now = Math.floor(Date.now() / 1000);
    const { token, jwk } = await signedOidcToken({
      iss: "https://token.actions.githubusercontent.com",
      aud: "cwl-noema-review",
      repository_owner: "ContextualWisdomLab",
      repository_owner_id: "999999999",
      repository: "ContextualWisdomLab/.github",
      job_workflow_ref:
        "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const appKeyPair = await signingKeyPair();
    const appPrivateKey = pemFromPkcs8(
      await crypto.subtle.exportKey("pkcs8", appKeyPair.privateKey),
    );
    const githubRequests: string[] = [];

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
      if (url.startsWith("https://api.github.com/")) {
        githubRequests.push(url);
        if (url.endsWith("/repos/ContextualWisdomLab/noema/installation")) {
          return Response.json({ id: 12345 });
        }
        if (url.endsWith("/app/installations/12345/access_tokens")) {
          return Response.json({
            token: "ghs_should_not_be_issued",
            expires_at: "2026-08-07T20:00:00Z",
          });
        }
      }
      return new Response("not found", { status: 404 });
    });

    const runtimeEnv = {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_REPOSITORY_OWNER_ID: ownerId,
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX:
        "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: appPrivateKey,
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    } as Env & { ALLOWED_REPOSITORY_OWNER_ID: string };

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      runtimeEnv,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_REPO_NOT_ALLOWED",
    });
    expect(githubRequests).toHaveLength(0);
  });
});
