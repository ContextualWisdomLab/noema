import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The wrapper worker (src/worker.ts) layers distributed rate limiting, exact
// workflow-ref trust, and single-use OIDC replay protection around the base
// token-exchange worker (src/index.ts). The base worker's own behavior is
// covered end-to-end in worker.test.ts; here we isolate the wrapper by mocking
// the base worker as a boundary so we can drive its post-exchange replay logic
// deterministically without re-signing a full GitHub App exchange.
vi.mock("../src/index", () => ({
  default: {
    fetch: vi.fn(async () =>
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            token: "ghs_installation_token",
            repository: "ContextualWisdomLab/noema",
          },
          trace_id: "base-trace",
        }),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
      )),
  },
}));

import worker, { type Env } from "../src/worker";

const baseEnv = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  ALLOWED_WORKFLOW_SHA: "e71fdab2ab088001f218765ecb5e3b7fabfee11a",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
};

const configuredRef = baseEnv.ALLOWED_WORKFLOW_REF_PREFIX;
const configuredSha = baseEnv.ALLOWED_WORKFLOW_SHA;

type MockFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function craftToken(
  payload: Record<string, unknown>,
  header: Record<string, unknown> = { alg: "RS256", kid: "test" },
): string {
  return `${encodeSegment(header)}.${encodeSegment(payload)}.signature`;
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

const acceptGuard: MockFetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return Response.json(
    { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
    { status: 201 },
  );
};

const conflictGuard: MockFetch = async (_input, init) => {
  const body = JSON.parse(String(init?.body ?? "{}"));
  return Response.json(
    { accepted: false, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
    { status: 409 },
  );
};

function exchangeRequest(headers: Record<string, string>): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
  });
}

function validReplayClaims(): Record<string, unknown> {
  return {
    job_workflow_ref: configuredRef,
    job_workflow_sha: configuredSha,
    sub: "repo:ContextualWisdomLab/.github:ref:refs/heads/main",
    jti: `jti-${crypto.randomUUID()}`,
    exp: Math.floor(Date.now() / 1000) + 300,
  };
}

describe("exchange wrapper replay protection", () => {
  beforeEach(() => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("consumes the OIDC token exactly once on a successful exchange", async () => {
    const env: Env = {
      ...baseEnv,
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(acceptGuard),
    };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken(validReplayClaims())}`,
        "cf-connecting-ip": "203.0.113.60",
      }),
      env,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-oidc-replay-protection")).toBe("single-use");
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
    expect(response.headers.get("x-rate-limit-limit")).toBe("1000");
    expect(response.headers.get("x-rate-limit-remaining")).toBe("999");
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: { token: "ghs_installation_token" },
    });
  });

  it("rejects a replayed OIDC token with a 401 challenge", async () => {
    const env: Env = {
      ...baseEnv,
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(conflictGuard),
    };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken(validReplayClaims())}`,
        "cf-connecting-ip": "203.0.113.61",
      }),
      env,
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(
      'Bearer realm="noema", error="invalid_token"',
    );
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC token has already been exchanged",
    });
  });

  it("fails closed with a 503 when the replay guard binding is unavailable", async () => {
    const env: Env = {
      ...baseEnv,
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      // NOEMA_OIDC_REPLAY_GUARD intentionally omitted so claimOidcTokenUsage
      // throws OidcReplayUnavailable and the wrapper must fail closed.
    };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken(validReplayClaims())}`,
        "cf-connecting-ip": "203.0.113.62",
      }),
      env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("www-authenticate")).toBeNull();
    expect(response.headers.get("x-rate-limit-scope")).toBe("distributed");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_AUTH_REPLAY",
      message: "OIDC replay protection unavailable",
    });
  });

  it("fails closed with a 503 when the token lacks bounded replay claims", async () => {
    const env: Env = {
      ...baseEnv,
      NOEMA_RATE_LIMITER: allowRateLimiter(),
      NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(acceptGuard),
    };
    // The workflow ref/SHA pair matches so workflow trust passes, but there is
    // no jti/exp pair, so replayClaims returns undefined and the guard is never consulted.
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken({
          job_workflow_ref: configuredRef,
          job_workflow_sha: configuredSha,
        })}`,
        "cf-connecting-ip": "203.0.113.63",
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

  it("reflects a trusted request trace id and fails closed on ambiguous workflow trust", async () => {
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          "cf-connecting-ip": "203.0.113.64",
          "x-request-id": "central-trace-01",
        },
      }),
      {
        ...baseEnv,
        NOEMA_RATE_LIMITER: allowRateLimiter(),
        // A prefix that does not begin with the workflow repository's path makes
        // configuredExactWorkflowRef reject it, so the wrapper is misconfigured.
        ALLOWED_WORKFLOW_REF_PREFIX: "unrelated/.github/workflows/other.yml@refs/heads/main",
      },
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("x-trace-id")).toBe("central-trace-01");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
      trace_id: "central-trace-01",
    });
  });

  it("rejects a token with too few segments before credential exchange", async () => {
    const env: Env = { ...baseEnv, NOEMA_RATE_LIMITER: allowRateLimiter() };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: "Bearer two.parts",
        "cf-connecting-ip": "203.0.113.65",
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is unavailable",
    });
  });

  it("rejects a non-object token payload before credential exchange", async () => {
    const env: Env = { ...baseEnv, NOEMA_RATE_LIMITER: allowRateLimiter() };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken([1, 2, 3] as unknown as Record<string, unknown>)}`,
        "cf-connecting-ip": "203.0.113.66",
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is unavailable",
    });
  });

  it("allows a matching workflow_ref/workflow_sha pair without job_workflow_ref", async () => {
    const env: Env = { ...baseEnv, NOEMA_RATE_LIMITER: allowRateLimiter() };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken({
          workflow_ref: configuredRef,
          workflow_sha: configuredSha,
        })}`,
        "cf-connecting-ip": "203.0.113.67",
      }),
      env,
    );

    // Caller workflow identity matches -> base 200 -> no jti -> fail closed.
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_AUTH_REPLAY",
    });
  });

  it("rejects an undecodable token payload before credential exchange", async () => {
    const env: Env = { ...baseEnv, NOEMA_RATE_LIMITER: allowRateLimiter() };
    const badPayload = Buffer.from("definitely not json", "utf8").toString("base64url");
    const token = `${encodeSegment({ alg: "RS256", kid: "test" })}.${badPayload}.signature`;
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${token}`,
        "cf-connecting-ip": "203.0.113.69",
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is unavailable",
    });
  });

  it("rejects a bearer token that carries no workflow identity claim", async () => {
    const env: Env = { ...baseEnv, NOEMA_RATE_LIMITER: allowRateLimiter() };
    const response = await worker.fetch(
      exchangeRequest({
        authorization: `Bearer ${craftToken({ sub: "repo:ContextualWisdomLab/.github" })}`,
        "cf-connecting-ip": "203.0.113.68",
      }),
      env,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is incomplete",
    });
  });
});