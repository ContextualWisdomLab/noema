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

function workflowEnvironment(workflowRef: string): Env {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX: workflowRef,
    ALLOWED_WORKFLOW_SHA: "a".repeat(40),
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: "unused",
    NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    NOEMA_RATE_LIMITER: allowRateLimiter(),
  };
}

async function exchangeFromWorkflowRef(workflowRef: string): Promise<Response> {
  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenWithWorkflowRef(workflowRef)}`,
        "cf-connecting-ip": "203.0.113.80",
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    workflowEnvironment(workflowRef),
  );
}

async function exchangeFromWorkflowRepository(workflowRepository: string): Promise<Response> {
  const workflowRef = `${workflowRepository}/.github/workflows/noema-review.yml@refs/heads/main`;
  const env = workflowEnvironment(workflowRef);
  env.ALLOWED_WORKFLOW_REPOSITORY = workflowRepository;

  return worker.fetch(
    new Request("https://noema.example/exchange", {
      method: "POST",
      headers: {
        authorization: `Bearer ${tokenWithWorkflowRef(workflowRef)}`,
        "cf-connecting-ip": "203.0.113.80",
        "content-type": "application/json",
      },
      body: JSON.stringify({ target_repository: "ContextualWisdomLab/noema" }),
    }),
    env,
  );
}

describe("wrapper workflow-ref canonical authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects an uppercase immutable commit ref before replay or base exchange", async () => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const uppercaseCommitRef =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${"A".repeat(40)}`;

    const response = await exchangeFromWorkflowRef(uppercaseCommitRef);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
    });
  });

  it.each([
    "ContextualWisdomLab/.github/.github/workflows/nested/noema-review.yml@refs/heads/main",
    "ContextualWisdomLab/.github/.github/workflows/noema-review.yaml/extra@refs/heads/main",
    "ContextualWisdomLab/.github/.github/workflows/noema-review.txt@refs/heads/main",
  ])("rejects invalid reusable workflow file authority %s before replay or base exchange", async (workflowRef) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const response = await exchangeFromWorkflowRef(workflowRef);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
    });
  });

  it.each([
    "ContextualWisdomLab/.",
    "ContextualWisdomLab/..",
    "ContextualWisdomLab/bad/name",
    "OtherOrg/.github",
  ])(
    "rejects invalid workflow repository authority %s before replay or base exchange",
    async (workflowRepository) => {
      vi.spyOn(console, "log").mockImplementation(() => undefined);

      const response = await exchangeFromWorkflowRepository(workflowRepository);

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error_code: "ERR_WORKFLOW_NOT_ALLOWED",
        message: "Workflow trust configuration unavailable",
      });
    },
  );

  it.each([
    "refs/heads/release..candidate",
    "refs/heads/release//candidate",
    "refs/heads/.hidden",
    "refs/tags/release.lock",
    "refs/heads/release.",
  ])("rejects Git-invalid named workflow ref %s before replay or base exchange", async (refName) => {
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const workflowRef =
      `ContextualWisdomLab/.github/.github/workflows/noema-review.yml@${refName}`;

    const response = await exchangeFromWorkflowRef(workflowRef);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
    });
  });
});
