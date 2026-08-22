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
      "ContextualWisdomLab/.github/.github/workflows/noema-review.yml@refs/heads/main",
    ALLOWED_WORKFLOW_SHA: "0123456789abcdef0123456789abcdef01234567",
    GITHUB_API_BASE: "https://api.github.com",
    GITHUB_APP_ID: "123456",
    // Deliberately non-importable. These tests assert the identifier-specific
    // failure remains present in addition to the independent key failure.
    GITHUB_APP_PRIVATE_KEY_PEM: "not-a-private-key",
    GITHUB_APP_INSTALLATION_ID: "987654",
    NOEMA_RATE_LIMITER: dummyNamespace(),
    NOEMA_OIDC_REPLAY_GUARD: dummyNamespace(),
  };
}

describe("runtime readiness GitHub numeric identifier bounds", () => {
  it.each([
    ["GITHUB_APP_ID", "github_app_id"],
    ["GITHUB_APP_INSTALLATION_ID", "github_app_installation_id"],
  ] as const)(
    "rejects a %s value outside JavaScript's exact safe-integer range",
    async (field, expectedFailure) => {
      const env = baseEnv();
      env[field] = "9007199254740992";

      const result = await evaluateRuntimeReadiness(env);

      expect(result.ready).toBe(false);
      expect(result.failedChecks).toContain(expectedFailure);
      expect(result.failedChecks).toContain("github_app_private_key");
    },
  );
});
