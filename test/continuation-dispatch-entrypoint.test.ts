import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import entrypoint, { type Env } from "../src/entrypoint";

const workflowRef = "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const workflowSha = "1".repeat(40);
const headSha = "2".repeat(40);
const baseSha = "3".repeat(40);
const signingKid = "continuation-dispatch-production-wiring";
const discoveryUrl = "https://token.actions.githubusercontent.com/.well-known/openid-configuration";
const jwksUrl = "https://token.actions.githubusercontent.com/.well-known/jwks";
let signingPrivateKey: CryptoKey;
let signingPublicJwk: JsonWebKey;

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function signedJwt(payload: Record<string, unknown>): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: signingKid });
  const claims = encodeJson(payload);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signingPrivateKey,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  return `${header}.${claims}.${Buffer.from(signature).toString("base64url")}`;
}

function dispatchBody(): string {
  return JSON.stringify({
    contract_version: "noema.continuation-dispatch.v1",
    dispatch_action: "noema_review_continuation",
    central_repository: "ContextualWisdomLab/.github",
    source_repository: "ContextualWisdomLab/.github",
    pull_request_number: 736,
    expected_head_sha: headSha,
    expected_base_sha: baseSha,
    expected_base_ref: "main",
    transport_retry_attempt: 1,
  });
}

function continuationRequest(token: string): Request {
  return new Request("https://noema.example/v1/continuation-dispatches", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.31",
    },
    body: dispatchBody(),
  });
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  }, true, ["sign", "verify"]) as CryptoKeyPair;
  signingPrivateKey = pair.privateKey;
  signingPublicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("continuation dispatch production entrypoint", () => {
  it("attributes boundary failures to the continuation dispatch route", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await entrypoint.fetch(
      new Request("https://noema.example/v1/continuation-dispatches", {
        method: "POST",
        headers: { authorization: "Bearer malformed" },
        body: dispatchBody(),
      }),
      {} as Env,
    );
    await entrypoint.fetch(continuationRequest("a.b.c"), {} as Env);

    const records = logSpy.mock.calls.map(([record]) => JSON.parse(String(record)) as {
      route?: string;
    });
    expect(records).toHaveLength(2);
    expect(records.map(({ route }) => route)).toEqual([
      "/v1/continuation-dispatches",
      "/v1/continuation-dispatches",
    ]);
  });

  it("returns the versioned method boundary and validates both central GitHub App identifiers", async () => {
    const wrongMethod = await entrypoint.fetch(
      new Request("https://noema.example/v1/continuation-dispatches"),
      {} as Env,
    );
    const missingCentralApp = await entrypoint.fetch(continuationRequest("a.b.c"), {
      GITHUB_APP_ID: "1",
    } as Env);
    const missingCentralInstallation = await entrypoint.fetch(continuationRequest("a.b.c"), {
      GITHUB_APP_ID: "1",
      CONTINUATION_DISPATCH_GITHUB_APP_ID: "2",
    } as Env);

    expect(wrongMethod.status).toBe(405);
    expect(wrongMethod.headers.get("allow")).toBe("POST");
    expect([missingCentralApp.status, missingCentralInstallation.status]).toEqual([503, 503]);
  });

  it("rejects a malformed continuation bearer with the dispatch identity contract", async () => {
    const response = await entrypoint.fetch(
      new Request("https://noema.example/v1/continuation-dispatches", {
        method: "POST",
        headers: {
          authorization: "Bearer invalid",
          "content-type": "application/json",
        },
        body: dispatchBody(),
      }),
      {} as Env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("allow")).toBeNull();
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="noema", error="invalid_token"',
    );
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_DISPATCH_IDENTITY_DENIED",
      message: "Continuation identity is malformed",
      details: { hint: expect.any(String) },
    });
  });

  it("verifies a signed production OIDC identity before failing closed on a missing replay guard", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url === discoveryUrl) return Response.json({ jwks_uri: jwksUrl });
      if (url === jwksUrl) {
        return Response.json({ keys: [{ ...signingPublicJwk, kid: signingKid, kty: "RSA" }] });
      }
      return new Response("unexpected privileged egress", { status: 500 });
    });
    const now = Math.floor(Date.now() / 1_000);
    const token = await signedJwt({
      iss: "https://token.actions.githubusercontent.com",
      aud: "cwl-noema-review",
      repository_owner: "ContextualWisdomLab",
      repository_owner_id: "295022177",
      repository: "ContextualWisdomLab/.github",
      repository_id: "1274066402",
      sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
      job_workflow_ref: workflowRef,
      job_workflow_sha: workflowSha,
      jti: "continuation-production-wiring-jti",
      exp: now + 300,
      nbf: now - 30,
      iat: now - 30,
    });
    const { default: isolatedEntrypoint } = await import("../src/entrypoint");

    const response = await isolatedEntrypoint.fetch(continuationRequest(token), {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX: workflowRef,
      ALLOWED_WORKFLOW_SHA: workflowSha,
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-replay-claim",
      CONTINUATION_DISPATCH_GITHUB_APP_ID: "2",
      CONTINUATION_DISPATCH_GITHUB_APP_INSTALLATION_ID: "3",
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
      NOEMA_RATE_LIMITER: {
        idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
        get: () => ({
          fetch: async () => Response.json({
            allowed: true,
            limit: 1000,
            remaining: 999,
            retry_after_seconds: 0,
          }),
        }) as unknown as DurableObjectStub,
      } as unknown as DurableObjectNamespace,
      NOEMA_OIDC_REPLAY_GUARD: {
        idFromName: (name: string) => ({ toString: () => name }) as DurableObjectId,
        get: () => ({
          fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? "{}")) as {
              expires_at_epoch_seconds: number;
            };
            return Response.json({
              accepted: true,
              expires_at_epoch_seconds: body.expires_at_epoch_seconds,
            }, { status: 201 });
          },
        }) as unknown as DurableObjectStub,
      } as unknown as DurableObjectNamespace,
    } as Env);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_GITHUB_DISPATCH_UPSTREAM",
      message: "Continuation state unavailable",
    });
  });
});
