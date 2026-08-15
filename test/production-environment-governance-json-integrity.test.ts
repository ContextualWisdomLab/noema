import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { main } from "../scripts/production-environment-governance-audit.mjs";

function protectedEnvironment() {
  return {
    id: 12345,
    name: "production",
    html_url:
      "https://github.com/ContextualWisdomLab/noema/deployments/activity_log?environments_filter=production",
    protection_rules: [
      {
        id: 100,
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [
          {
            type: "Team",
            reviewer: {
              id: 2468,
              slug: "production-approvers",
              name: "Production Approvers",
            },
          },
        ],
      },
      { id: 101, type: "branch_policy" },
    ],
    deployment_branch_policy: {
      protected_branches: true,
      custom_branch_policies: false,
    },
  };
}

describe("production environment governance JSON integrity", () => {
  it("fails closed on duplicate decoded object keys before policy evaluation", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-production-governance-json-"));
    const environment = JSON.stringify(protectedEnvironment());
    const ambiguousEnvironment = environment.replace(
      '"protection_rules":',
      '"protection_rules":[],"protection_\\u0072ules":',
    );
    const setExitCode = vi.fn();

    try {
      const report = main({
        sourceEnvironment: {
          GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
          NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
        },
        runGhImpl: () => ambiguousEnvironment,
        log: () => undefined,
        setExitCode,
      });

      expect(report.status).toBe("FAIL");
      expect(report.failures[0]).toMatchObject({
        code: "production_environment_collection_failed",
        detail: "GitHub CLI returned JSON with duplicate decoded object keys.",
      });
      expect(setExitCode).toHaveBeenCalledWith(1);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
