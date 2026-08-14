import { afterEach, describe, expect, it, vi } from "vitest";

// claimOidcTokenUsage normally wraps guard failures as OidcReplayUnavailable.
// The wrapper also keeps a fail-closed fallback for unexpected error types, so
// this suite exercises both the real wrapped path and that defensive fallback.
// The base worker is mocked to a successful exchange so the wrapper reaches its
// post-exchange replay-consumption step; the real replay guard remains active
// for the wrapped-unavailability case.
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
    claimOidcTokenUsage: vi.fn(async (jti: string, guardEnv: Env) => {
      if (jti === "safe-jti") {
        throw new Error("raw non-wrapped replay-guard failure");
      }
      return actual.claimOidcTokenUsage(jti, guardEnv);
    }),
  };
});

import worker, { type Env } from "../src/worker";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";

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
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
  NOEMA_RATE_LIMITER: namespaceReturning(async () =>
    Response.json({ allowed: true, limit: 1000, remaining: 999, retry_after_seconds: 0 })),
  NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () =>
    Response.json({ accepted: true, expires_at_epoch_seconds: 1 }, { status: 201 })),
};

const replayUnavailableEnv: Env = {
  ...env,
  NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async () =>
    new Response("replay guard unavailable", { status: 503 })),
};

describe("wrapper defensive replay-guard fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with a generic detail when replay consumption throws an unexpected error", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = `${encodeSegment({ alg: "RS256", kid: "test" })}.${encodeSegment({
      job_workflow_ref: configuredRef,
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

  it("fails closed when the replay guard returns an unavailable response", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = `${encodeSegment({ alg: "RS256", kid: "test" })}.${encodeSegment({
      job_workflow_ref: configuredRef,
      jti: "safe-jti-unavailable",
      exp: Math.floor(Date.now() / 1000) + 300,
    })}.signature`;

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "cf-connecting-ip": "203.0.113.72",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      replayUnavailableEnv,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection unavailable",
    });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("OIDC replay guard returned 503"));
  });
});
