import { afterEach, describe, expect, it, vi } from "vitest";

// claimOidcTokenUsage only ever throws OidcReplayDetected or
// OidcReplayUnavailable (it wraps every other failure), so the wrapper's
// fail-closed branch that handles an *unexpected* (non-wrapped) error type from
// the replay guard can only be exercised by injecting such an error at the
// module boundary. The base worker is mocked to a successful exchange so the
// wrapper reaches its post-exchange replay-consumption step; real replay-guard
// behavior is covered in oidc-replay.test.ts and worker-exchange-replay.test.ts.
vi.mock("../src/index", () => ({
  default: {
    fetch: vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, data: { token: "ghs_installation_token" }, trace_id: "base" }),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
      )),
  },
}));

vi.mock("../src/oidc-replay", async (importActual) => {
  const actual = await importActual<typeof import("../src/oidc-replay")>();
  return {
    ...actual,
    claimOidcTokenUsage: vi.fn(async () => {
      throw new Error("raw non-wrapped replay-guard failure");
    }),
  };
});

import worker, { type Env } from "../src/worker";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredSha = "e71fdab2ab088001f218765ecb5e3b7fabfee11a";

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

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

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX: configuredRef,
  ALLOWED_WORKFLOW_SHA: configuredSha,
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_RATE_LIMITER: namespaceReturning(async () =>
    Response.json({ allowed: true, limit: 1000, remaining: 999, retry_after_seconds: 0 })),
  NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () =>
    Response.json({ accepted: true, expires_at_epoch_seconds: 1 }, { status: 201 })),
};

describe("wrapper defensive replay-guard fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a present Authorization header that is not a Bearer token", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: "Basic not-a-github-oidc-token",
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.71",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is unavailable",
    });
  });

  it("fails closed if a credential-bearing base worker ever succeeds without parsed replay claims", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.71",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection claims unavailable",
    });
  });

  it("fails closed with a generic detail when replay consumption throws an unexpected error", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = `${encodeSegment({ alg: "RS256", kid: "test" })}.${encodeSegment({
      job_workflow_ref: configuredRef,
      job_workflow_sha: configuredSha,
      jti: "safe-jti",
      exp: Math.floor(Date.now() / 1000) + 300,
    })}.signature`;

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.71",
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
  });
});