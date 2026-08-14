import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

describe("workflow registry duplicate record integrity", () => {
  it("fails closed when pagination repeats the same workflow identity", () => {
    const workflow = {
      id: 42,
      path: ".github/workflows/ci.yml",
      state: "active",
    };

    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      observedAt: "2026-08-14T00:00:00.000Z",
      workflows: [workflow, { ...workflow }],
      trackedWorkflowPaths: [workflow.path],
      activePullRequestWorkflowPaths: [],
      pagination: {
        totalCount: 2,
        receipts: [{ page: 1, itemCount: 2, hasNext: false }],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "workflow_record_duplicate",
      workflow_id: 42,
      detail:
        "Workflow registry repeated id 42 for path .github/workflows/ci.yml; duplicate records cannot prove a complete registry snapshot.",
    });
  });

  it("fails closed when different workflow identities claim the same repository path", () => {
    const workflowPath = ".github/workflows/ci.yml";
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      observedAt: "2026-08-14T00:00:00.000Z",
      workflows: [
        { id: 42, path: workflowPath, state: "active" },
        { id: 43, path: workflowPath, state: "active" },
      ],
      trackedWorkflowPaths: [workflowPath],
      activePullRequestWorkflowPaths: [],
      pagination: {
        totalCount: 2,
        receipts: [{ page: 1, itemCount: 2, hasNext: false }],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "workflow_path_reused",
      workflow_id: 43,
      detail:
        "Workflow path .github/workflows/ci.yml is associated with conflicting ids 42 and 43.",
    });
  });
});
