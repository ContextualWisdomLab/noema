import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/index", () => ({
  default: {
    fetch: vi.fn(async () =>
      new Response(
        JSON.stringify({ ok: true, data: { token: "ghs_test" }, trace_id: "base" }),
        { status: 200, headers: { "content-type": "application/json; charset=utf-8" } },
      )),
  },
}));

import baseWorker from "../src/index";
import worker, { type Env } from "../src/worker";

const configuredRef =
  "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main";
const configuredSha = "e71fdab2ab088001f218765ecb5e3b7fabfee11a";
const callerRef =
  "ContextualWisdomLab/noema/.github/workflows/review.yml@refs/heads/feature/example";
const callerSha = "f".repeat(40);

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function token(payload: Record<string, unknown>): string {
  return `${encodeSegment({ alg: "RS256", kid: "workflow-sha-test" })}.${encodeSegment(payload)}.signature`;
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

function runtimeEnv(overrides: Record<string, unknown> = {}): Env {
  return {
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
    NOEMA_OIDC_REPLAY_GUARD: namespaceReturning(async (_input, init) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return Response.json(
        { accepted: true, expires_at_epoch_seconds: body.expires_at_epoch_seconds },
        { status: 201 },
      );
    }),
    ...overrides,
  } as Env;
}

function requestWith(payload: Record<string, unknown>): Request {
  return new Request("https://noema.example/exchange", {
    method: "POST",
    headers: {
      authorization: `Bearer ${token({
        jti: `jti-${crypto.randomUUID()}`,
        exp: Math.floor(Date.now() / 1000) + 300,
        ...payload,
      })}`,
      "content-type": "application/json",
      "cf-connecting-ip": "203.0.113.72",
    },
    body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
  });
}

async function expectWorkflowBlock(
  payload: Record<string, unknown>,
  env: Env = runtimeEnv(),
  status = 403,
): Promise<Record<string, unknown>> {
  const response = await worker.fetch(requestWith(payload), env);
  expect(response.status).toBe(status);
  expect(response.headers.get("cache-control")).toBe("no-store");
  return response.json() as Promise<Record<string, unknown>>;
}

describe("immutable workflow source trust", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects a reusable workflow ref whose immutable workflow SHA differs", async () => {
    await expect(
      expectWorkflowBlock({
        job_workflow_ref: configuredRef,
        job_workflow_sha: "0".repeat(40),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow SHA is not allowed",
      details: { match_policy: "exact" },
    });
  });

  it("does not let caller workflow_sha satisfy a reusable job_workflow_ref", async () => {
    await expect(
      expectWorkflowBlock({
        job_workflow_ref: configuredRef,
        workflow_sha: configuredSha,
      }),
    ).resolves.toMatchObject({
      message: "OIDC workflow identity is incomplete",
    });
  });

  it("does not ignore a reusable workflow SHA beside a complete caller identity", async () => {
    const baseFetch = vi.mocked(baseWorker.fetch);
    baseFetch.mockClear();

    await expect(
      expectWorkflowBlock({
        workflow_ref: configuredRef,
        workflow_sha: configuredSha,
        job_workflow_sha: configuredSha,
      }),
    ).resolves.toMatchObject({
      message: "OIDC workflow identity is incomplete",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed reusable claims instead of falling back to a complete caller pair", async () => {
    const baseFetch = vi.mocked(baseWorker.fetch);
    baseFetch.mockClear();

    await expect(
      expectWorkflowBlock({
        workflow_ref: configuredRef,
        workflow_sha: configuredSha,
        job_workflow_ref: 42,
        job_workflow_sha: configuredSha,
      }),
    ).resolves.toMatchObject({
      message: "OIDC workflow identity is incomplete",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed caller claims even when the reusable pair is complete", async () => {
    const baseFetch = vi.mocked(baseWorker.fetch);
    baseFetch.mockClear();

    await expect(
      expectWorkflowBlock({
        workflow_ref: configuredRef,
        workflow_sha: "not-a-canonical-sha",
        job_workflow_ref: configuredRef,
        job_workflow_sha: configuredSha,
      }),
    ).resolves.toMatchObject({
      message: "OIDC workflow identity is incomplete",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("fails closed when the immutable workflow SHA is not configured", async () => {
    await expect(
      expectWorkflowBlock(
        { job_workflow_ref: configuredRef, job_workflow_sha: configuredSha },
        runtimeEnv({ ALLOWED_WORKFLOW_SHA: undefined }),
        503,
      ),
    ).resolves.toMatchObject({
      message: "Workflow trust configuration unavailable",
    });
  });

  it("fails closed when the configured immutable workflow SHA is malformed", async () => {
    await expect(
      expectWorkflowBlock(
        { job_workflow_ref: configuredRef, job_workflow_sha: configuredSha },
        runtimeEnv({ ALLOWED_WORKFLOW_SHA: `${configuredSha}*` }),
        503,
      ),
    ).resolves.toMatchObject({
      message: "Workflow trust configuration unavailable",
    });
  });

  it("rejects whitespace-padded workflow SHA configuration exactly as readiness does", async () => {
    await expect(
      expectWorkflowBlock(
        { job_workflow_ref: configuredRef, job_workflow_sha: configuredSha },
        runtimeEnv({ ALLOWED_WORKFLOW_SHA: ` ${configuredSha}` }),
        503,
      ),
    ).resolves.toMatchObject({
      message: "Workflow trust configuration unavailable",
    });
  });

  it("refuses parser disagreement before the credential-bearing base worker runs", async () => {
    const baseFetch = vi.mocked(baseWorker.fetch);
    baseFetch.mockClear();

    await expect(
      expectWorkflowBlock({
        job_workflow_ref: configuredRef,
        job_workflow_sha: configuredSha,
        padding: "x".repeat(9_000),
      }),
    ).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is unavailable",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("requires a complete workflow identity in every present bearer token", async () => {
    const baseFetch = vi.mocked(baseWorker.fetch);
    baseFetch.mockClear();

    await expect(expectWorkflowBlock({})).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "OIDC workflow identity is incomplete",
    });
    expect(baseFetch).not.toHaveBeenCalled();
  });

  it("accepts caller metadata beside the exact reusable workflow identity", async () => {
    const response = await worker.fetch(
      requestWith({
        workflow_ref: callerRef,
        workflow_sha: callerSha,
        job_workflow_ref: configuredRef,
        job_workflow_sha: configuredSha,
      }),
      runtimeEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-oidc-replay-protection")).toBe("single-use");
  });

  it("accepts the exact reusable workflow ref and its paired immutable SHA", async () => {
    const response = await worker.fetch(
      requestWith({
        job_workflow_ref: configuredRef,
        job_workflow_sha: configuredSha,
      }),
      runtimeEnv(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-oidc-replay-protection")).toBe("single-use");
  });

  it("accepts the exact caller workflow ref and its paired immutable SHA", async () => {
    const response = await worker.fetch(
      requestWith({ workflow_ref: configuredRef, workflow_sha: configuredSha }),
      runtimeEnv(),
    );

    expect(response.status).toBe(200);
  });
});