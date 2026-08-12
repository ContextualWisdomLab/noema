import { describe, expect, it } from "vitest";
import {
  classifyWorkflowRegistry,
  collectWorkflowRegistryAudit,
} from "../scripts/workflow-registry-audit.mjs";

const exactSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const observedAt = "2026-08-12T16:40:00.000Z";

function stableBranch() {
  return {
    sha: exactSha,
    workflowPaths: [".github/workflows/ci.yml"],
  };
}

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    path: ".github/workflows/ci.yml",
    state: "active",
    ...overrides,
  };
}

describe("workflow registry review regressions", () => {
  it("redacts credentials from collection failure diagnostics", async () => {
    const leaked = {
      urlPassword: "url-password-secret",
      queryToken: "query-token-secret",
      bearerToken: "bearer-token-secret",
      envToken: "env-token-secret",
      githubToken: "ghp_1234567890abcdefghijklmnopqrstuvwxyz",
    };
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async () => {
        throw new Error(
          `gh failed: https://oauth2:${leaked.urlPassword}@github.com/repos/example?access_token=${leaked.queryToken} Authorization: Bearer ${leaked.bearerToken} GH_TOKEN=${leaked.envToken} ${leaked.githubToken}`,
        );
      },
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    const detail = result.failures[0].detail;
    expect(detail).toContain("gh failed:");
    expect(detail).toContain("[REDACTED]");
    for (const secret of Object.values(leaked)) {
      expect(detail).not.toContain(secret);
    }
  });

  it("fails closed at the page bound derived from the first advertised total", async () => {
    let calls = 0;
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async () => {
        calls += 1;
        if (calls > 3) {
          throw new Error("reader should not be called beyond the advertised page bound");
        }
        return {
          totalCount: 1,
          workflows: [workflow()],
          hasNext: true,
        };
      },
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(calls).toBe(1);
    expect(result.status).toBe("FAIL");
    expect(result.failures[0]).toMatchObject({
      code: "workflow_registry_collection_failed",
    });
    expect(result.failures[0].detail).toContain("pagination exceeded");
  });

  it("distinguishes Unicode normalization ambiguity from a true active orphan", () => {
    const trackedPath = ".github/workflows/caf\u00e9.yml";
    const registryPath = ".github/workflows/cafe\u0301.yml";
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: exactSha,
      observedAt,
      workflows: [workflow({ path: registryPath })],
      trackedWorkflowPaths: [trackedPath],
      activePullRequestWorkflowPaths: [],
      pagination: {
        totalCount: 1,
        receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.workflows[0].classification).toBe("unresolved_registry_record");
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "workflow_path_normalization_mismatch",
        workflow_id: 1,
      }),
    );
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ code: "active_orphan_workflow" }),
    );
  });
});
