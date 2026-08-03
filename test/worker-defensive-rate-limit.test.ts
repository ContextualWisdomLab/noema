import { afterEach, describe, expect, it, vi } from "vitest";

// checkDistributedRateLimit wraps every internal failure in
// DistributedRateLimitUnavailable, so the wrapper's fail-closed branch that
// handles an *unexpected* (non-wrapped) error type can only be exercised by
// injecting such an error at the module boundary. This verifies the wrapper
// still fails closed with a generic detail rather than propagating the raw
// error or failing open. The real rate-limit behavior is covered in
// distributed-rate-limit.test.ts.
vi.mock("../src/rate-limit", async (importActual) => {
  const actual = await importActual<typeof import("../src/rate-limit")>();
  return {
    ...actual,
    checkDistributedRateLimit: vi.fn(async () => {
      throw new Error("raw non-wrapped limiter failure");
    }),
  };
});

import worker, { type Env } from "../src/worker";

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

const env: Env = {
  ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
  ALLOWED_AUDIENCE: "cwl-noema-review",
  ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
  ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
  ALLOWED_WORKFLOW_REF_PREFIX:
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
  GITHUB_API_BASE: "https://api.github.com",
  GITHUB_APP_ID: "1",
  GITHUB_APP_PRIVATE_KEY_PEM: "unused",
  NOEMA_RATE_LIMIT_PER_MINUTE: "60",
  NOEMA_RATE_LIMITER: dummyNamespace(),
};

describe("wrapper defensive rate-limit fallback", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed with a generic detail when the limiter throws an unexpected error", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: { "cf-connecting-ip": "203.0.113.70" },
      }),
      env,
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("1");
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_RATE_LIMIT",
      message: "Distributed rate limiter unavailable",
      details: { scope: "distributed" },
    });
  });
});
