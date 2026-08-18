import { describe, expect, it, vi } from "vitest";
import { runWorkflowRegistryDisablement } from "../scripts/workflow-registry-live-disable.mjs";

const repository = "ContextualWisdomLab/noema";
const mainSha = "a".repeat(40);
const workflowPath = ".github/workflows/obsolete-repair.yml";

function activeOrphanAudit() {
  return {
    schema_version: 1,
    repository_full_name: repository,
    default_branch_sha: mainSha,
    observed_at: "2026-08-18T00:00:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "FAIL",
    failures: [{
      code: "active_orphan_workflow",
      workflow_id: 101,
      detail: "Active workflow is absent from protected main.",
    }],
    workflows: [{
      workflow_id: 101,
      workflow_path: workflowPath,
      workflow_state: "active",
      classification: "active_orphan",
    }],
  };
}

function activePullRequestOwnedAudit() {
  return {
    schema_version: 1,
    repository_full_name: repository,
    default_branch_sha: mainSha,
    observed_at: "2026-08-18T00:00:01.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "PASS",
    failures: [],
    workflows: [{
      workflow_id: 101,
      workflow_path: workflowPath,
      workflow_state: "active",
      classification: "active_pr_owned",
    }],
  };
}

describe("workflow-registry disablement active-PR race", () => {
  it("collects the live registry before the authorizing audit so a newly opened PR blocks disablement", async () => {
    let activePullRequestAdopted = false;
    const collectLiveWorkflows = vi.fn(async () => {
      activePullRequestAdopted = true;
      return [{ id: 101, path: workflowPath, state: "active" }];
    });
    const collectAudit = vi.fn(async () => (
      activePullRequestAdopted ? activePullRequestOwnedAudit() : activeOrphanAudit()
    ));
    const disableWorkflow = vi.fn();

    await expect(runWorkflowRegistryDisablement({
      repository,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows,
      transport: {
        revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: mainSha }),
        revalidateWorkflow: vi.fn().mockResolvedValue({
          id: 101,
          path: workflowPath,
          state: "active",
        }),
        disableWorkflow,
      },
    })).rejects.toThrow("fresh workflow disablement plan is non-authorizing");

    expect(collectLiveWorkflows).toHaveBeenCalledTimes(1);
    expect(collectAudit).toHaveBeenCalledTimes(1);
    expect(disableWorkflow).not.toHaveBeenCalled();
  });
});
