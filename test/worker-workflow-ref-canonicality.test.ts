import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/index", () => ({
  default: {
    fetch: vi.fn(async () => Response.json({ ok: true })),
  },
}));

import worker, { type Env } from "../src/worker";

function allowRateLimiter(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => Response.json({
          allowed: true,
          limit: 1000,
          remaining: 999,
          retry_after_seconds: 0,
        }),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function tokenWithWorkflowRef(workflowRef: string): string {
  return `${encodeSegment({ alg: "RS256", kid: "test" })}.${encodeSegment({
    job_workflow_ref: workflowRef,
    jti: "canonical-ref-test",
    exp: Math.floor(Date.now() / 1000) + 300,
  })}.signature`;
}

describe("wrapper workflow-ref canonical authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an uppercase immutable commit ref before replay or base exchange", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const uppercaseCommitRef =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${"A".repeat(40)}`;
    const env: Env = {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
      ALLOWED_WORKFLOW_REF_PREFIX: uppercaseCommitRef,
      ALLOWED_WORKFLOW_SHA: "a".repeat(40),
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: "unused",
      NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
      NOEMA_RATE_LIMITER: allowRateLimiter(),
    };

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${tokenWithWorkflowRef(uppercaseCommitRef)}`,
          "cf-connecting-ip": "203.0.113.80",
          "content-type": "application/json",
        },
        body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
      }),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
    });
  });
});
