import { describe, expect, it } from "vitest";

import {
  evaluateRuntimeReadiness,
  type RuntimeReadinessEnv,
} from "../src/runtime-readiness";

function dummyNamespace(): DurableObjectNamespace {
  return {
    idFromName(name: string) {
      return { toString: () => name } as DurableObjectId;
    },
    get() {
      return {} as DurableObjectStub;
    },
  } as unknown as DurableObjectNamespace;
}

function baseEnv(): RuntimeReadinessEnv {
  return {
    ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
    ALLOWED_AUDIENCE: "cwl-noema-review",
    ALLOWED_REPOSITORY_OWNER: "ContextualWisdomLab",
    ALLOWED_WORKFLOW_REPOSITORY: "ContextualWisdomLab/.github",
    ALLOWED_WORKFLOW_REF_PREFIX:
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@0123456789abcdef0123456789abcdef01234567",
    ALLOWED_WORKFLOW_SHA: "0123456789abcdef0123456789abcdef01234567",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    GITHUB_APP_PRIVATE_KEY_PEM: "not-a-private-key",
    GITHUB_APP_INSTALLATION_ID: "987654",
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

describe("runtime readiness immutable workflow-source coherence", () => {
  it("fails closed when an immutable workflow ref commit disagrees with ALLOWED_WORKFLOW_SHA", async () => {
    const env = baseEnv();
    env.ALLOWED_WORKFLOW_SHA = "89abcdef0123456789abcdef0123456789abcdef";

    const result = await evaluateRuntimeReadiness(env);

    expect(result.ready).toBe(false);
    expect(result.failedChecks).toContain("allowed_workflow_sha");
    expect(result.failedChecks).not.toContain("allowed_workflow_ref");
  });

  it("accepts a coherent immutable workflow ref and source SHA at the workflow-source boundary", async () => {
    const result = await evaluateRuntimeReadiness(baseEnv());

    expect(result.failedChecks).not.toContain("allowed_workflow_ref");
    expect(result.failedChecks).not.toContain("allowed_workflow_sha");
    expect(result.failedChecks).toContain("github_app_private_key");
  });
});
