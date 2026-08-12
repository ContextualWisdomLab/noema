import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

const mainSha = "e52f802c65cc07f3a9083e78d053bbe16d8e4b37";
const observedAt = "2026-08-12T22:00:00.000Z";
const workflowRecord = {
  id: 9001,
  name: "Historical repair",
  path: ".github/workflows/historical-repair.yml",
  state: "active",
};
const pagination = {
  totalCount: 1,
  receipts: [{ page: 1, itemCount: 1, hasNext: false }],
};

describe("workflow registry path inventory trust", () => {
  it.each([
    {
      label: "tracked inventory supplied as a string",
      trackedWorkflowPaths: ".github/workflows/ci.yml",
      activePullRequestWorkflowPaths: [],
      expectedCode: "tracked_workflow_paths_invalid",
    },
    {
      label: "tracked inventory containing a non-string",
      trackedWorkflowPaths: [42],
      activePullRequestWorkflowPaths: [],
      expectedCode: "tracked_workflow_paths_invalid",
    },
    {
      label: "tracked inventory containing a non-workflow path",
      trackedWorkflowPaths: ["README.md"],
      activePullRequestWorkflowPaths: [],
      expectedCode: "tracked_workflow_paths_invalid",
    },
    {
      label: "active PR inventory supplied as a string",
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: ".github/workflows/current-pr.yml",
      expectedCode: "active_pr_workflow_paths_invalid",
    },
    {
      label: "active PR inventory containing a non-string",
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [null],
      expectedCode: "active_pr_workflow_paths_invalid",
    },
    {
      label: "active PR inventory containing a non-workflow path",
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: ["src/index.ts"],
      expectedCode: "active_pr_workflow_paths_invalid",
    },
  ])("fails closed instead of inventing an orphan for $label", ({
    trackedWorkflowPaths,
    activePullRequestWorkflowPaths,
    expectedCode,
  }) => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflowRecord],
      trackedWorkflowPaths,
      activePullRequestWorkflowPaths,
      pagination,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(expect.objectContaining({ code: expectedCode }));
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "workflow_path_inventory_untrusted",
        workflow_id: workflowRecord.id,
      }),
    );
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ code: "active_orphan_workflow" }),
    );
    expect(result.workflows[0]).toMatchObject({
      workflow_id: workflowRecord.id,
      classification: "unresolved_registry_record",
    });
  });
});
