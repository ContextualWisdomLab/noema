import { describe, expect, it, vi } from "vitest";
import { collectWorkflowRegistryAudit } from "../scripts/workflow-registry-audit.mjs";

describe("workflow registry collector repository binding", () => {
  it.each([
    "ContextualWisdomLab/other",
    "contextualwisdomlab/noema",
    " ContextualWisdomLab/noema ",
    null,
  ])("refuses repository %j before any GitHub collection call", async (repository) => {
    const resolveDefaultBranch = vi.fn(async () => ({
      sha: "1fbe857a5cf52b5af31e2db5e4676876289e3e23",
      workflowPaths: [".github/workflows/ci.yml"],
    }));
    const listWorkflowPage = vi.fn(async () => ({
      totalCount: 0,
      workflows: [],
      hasNext: false,
    }));
    const listActivePullRequestWorkflowPaths = vi.fn(async () => []);

    const result = await collectWorkflowRegistryAudit({
      repository,
      resolveDefaultBranch,
      listWorkflowPage,
      listActivePullRequestWorkflowPaths,
      now: () => "2026-08-13T15:45:00.000Z",
    });

    expect(result).toMatchObject({
      repository_full_name: repository,
      default_branch_sha: null,
      status: "FAIL",
      failures: [
        {
          code: "repository_identity_invalid",
          detail:
            "Workflow registry evidence must be bound to exact repository ContextualWisdomLab/noema.",
        },
      ],
      workflows: [],
    });
    expect(resolveDefaultBranch).not.toHaveBeenCalled();
    expect(listWorkflowPage).not.toHaveBeenCalled();
    expect(listActivePullRequestWorkflowPaths).not.toHaveBeenCalled();
  });
});
