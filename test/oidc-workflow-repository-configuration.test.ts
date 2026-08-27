import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type Env } from "../src/worker";
import {
  evaluateRuntimeReadiness,
  type RuntimeReadinessEnv,
} from "../src/runtime-readiness";

const centralWorkflowRepository = "ContextualWisdomLab/.github";
const untrustedWorkflowRepository = "ContextualWisdomLab/noema";
const workflowSha = "a".repeat(40);

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function rateLimiterNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {
        fetch: async () => Response.json({
          allowed: true,
          limit: 60,
          remaining: 59,
          retry_after_seconds: 0,
        }),
      } as unknown as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function misconfiguredWorkerEnv(): Env {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: untrustedWorkflowRepository,
    ALLOWED_WORKFLOW_REF_PREFIX:
      `${untrustedWorkflowRepository}/.github/workflows/noema-review.yml@refs/heads/main`,
    ALLOWED_WORKFLOW_SHA: workflowSha,
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY_PEM: "unused-before-configuration-rejection",
    NOEMA_RATE_LIMIT_PER_MINUTE: "1000",
    NOEMA_RATE_LIMITER: rateLimiterNamespace(),
  };
}

describe("central reusable-workflow repository authority", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fails closed after distributed rate limiting but before OIDC egress when the configured workflow repository is not central .github", async () => {
    const env = misconfiguredWorkerEnv();
    const now = Math.floor(Date.now() / 1000);
    const token = [
      encodeSegment({ alg: "RS256", kid: "configuration-must-fail-first" }),
      encodeSegment({
        iss: env.ALLOWED_ISSUER,
        aud: env.ALLOWED_AUDIENCE,
        repository_owner: env.ALLOWED_REPOSITORY_OWNER,
        repository_owner_id: "295022177",
        repository: untrustedWorkflowRepository,
        repository_id: "1285107801",
        job_workflow_ref: env.ALLOWED_WORKFLOW_REF_PREFIX,
        job_workflow_sha: workflowSha,
        sub: "repo:ContextualWisdomLab/noema:ref:refs/heads/main",
        exp: now + 300,
        nbf: now - 30,
        iat: now - 30,
      }),
      "AA",
    ].join(".");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("OIDC egress must not occur for invalid trust configuration", { status: 500 }),
    );

    const response = await worker.fetch(
      new Request("https://noema.example/exchange", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "cf-connecting-ip": "203.0.113.240",
        },
      }),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error_code: "ERR_WORKFLOW_NOT_ALLOWED",
      message: "Workflow trust configuration unavailable",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("marks a non-central workflow repository configuration not ready", async () => {
    const env: RuntimeReadinessEnv = {
      ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      ALLOWED_AUDIENCE: "cwl-noema-review",
      ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
      ALLOWED_WORKFLOW_REPOSITORY: untrustedWorkflowRepository,
      ALLOWED_WORKFLOW_REF_PREFIX:
        `${untrustedWorkflowRepository}/.github/workflows/noema-review.yml@refs/heads/main`,
      ALLOWED_WORKFLOW_SHA: workflowSha,
      GITHUB_API_BASE: "https://api.github.com",
      GITHUB_APP_ID: "1",
      GITHUB_APP_PRIVATE_KEY_PEM: "not-a-key",
    };

    const result = await evaluateRuntimeReadiness(env);

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("allowed_workflow_repository");
    expect(centralWorkflowRepository).toBe("ContextualWisdomLab/.github");
  });
});
