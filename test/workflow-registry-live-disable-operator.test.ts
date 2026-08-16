import { describe, expect, it, vi } from "vitest";
import { runWorkflowRegistryDisablement } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const OBSERVED_AT = "2026-08-16T03:10:00.000Z";

function activeAudit() {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: OBSERVED_AT,
    pagination_receipts: [{ page: 1, itemCount: 2, hasNext: false }],
    status: "FAIL",
    failures: [{
      code: "active_orphan_workflow",
      workflow_id: 101,
      detail: "Active workflow is absent from protected main.",
    }],
    workflows: [
      {
        workflow_id: 101,
        workflow_path: ".github/workflows/obsolete-repair.yml",
        workflow_state: "active",
        classification: "active_orphan",
      },
      {
        workflow_id: 202,
        workflow_path: ".github/workflows/ci.yml",
        workflow_state: "active",
        classification: "present_on_default_branch",
      },
    ],
  };
}

function postAudit(defaultBranchSha = MAIN_SHA) {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: defaultBranchSha,
    observed_at: "2026-08-16T03:10:01.000Z",
    pagination_receipts: [{ page: 1, itemCount: 2, hasNext: false }],
    status: "PASS",
    failures: [],
    workflows: [
      {
        workflow_id: 101,
        workflow_path: ".github/workflows/obsolete-repair.yml",
        workflow_state: "disabled_manually",
        classification: "disabled_registry_record",
      },
      {
        workflow_id: 202,
        workflow_path: ".github/workflows/ci.yml",
        workflow_state: "active",
        classification: "present_on_default_branch",
      },
    ],
  };
}

const liveWorkflows = [
  { id: 101, path: ".github/workflows/obsolete-repair.yml", state: "active" },
  { id: 202, path: ".github/workflows/ci.yml", state: "active" },
];

describe("live workflow-registry disablement operator", () => {
  it("disables exactly the requested audited orphan and verifies the full post-state", async () => {
    const collectAudit = vi
      .fn()
      .mockResolvedValueOnce(activeAudit())
      .mockResolvedValueOnce(postAudit());
    const disableWorkflow = vi.fn().mockResolvedValue(undefined);
    const revalidateWorkflow = vi
      .fn()
      .mockResolvedValueOnce(liveWorkflows[0])
      .mockResolvedValueOnce({ ...liveWorkflows[0], state: "disabled_manually" });

    const receipt = await runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows: vi.fn().mockResolvedValue(liveWorkflows),
      transport: {
        revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
        revalidateWorkflow,
        disableWorkflow,
      },
    });

    expect(disableWorkflow).toHaveBeenCalledTimes(1);
    expect(disableWorkflow).toHaveBeenCalledWith({ repository: REPOSITORY, workflowId: 101 });
    expect(collectAudit).toHaveBeenCalledTimes(2);
    expect(receipt).toEqual({
      schema_version: 1,
      repository_full_name: REPOSITORY,
      protected_main_sha: MAIN_SHA,
      workflow_id: 101,
      workflow_path: ".github/workflows/obsolete-repair.yml",
      prior_state: "active",
      final_state: "disabled_manually",
      mutation: "disable",
      post_audit_status: "PASS",
    });
  });

  it("refuses a workflow identity that is not an exact audited active orphan", async () => {
    const disableWorkflow = vi.fn();

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 202,
      collectAudit: vi.fn().mockResolvedValue(activeAudit()),
      collectLiveWorkflows: vi.fn().mockResolvedValue(liveWorkflows),
      transport: {
        revalidateDefaultBranch: vi.fn(),
        revalidateWorkflow: vi.fn(),
        disableWorkflow,
      },
    })).rejects.toThrow("requested workflow is not an exact active-orphan candidate");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("fails the retained receipt if protected main moves during post-disablement verification", async () => {
    const collectAudit = vi
      .fn()
      .mockResolvedValueOnce(activeAudit())
      .mockResolvedValueOnce(postAudit("b".repeat(40)));

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows: vi.fn().mockResolvedValue(liveWorkflows),
      transport: {
        revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
        revalidateWorkflow: vi
          .fn()
          .mockResolvedValueOnce(liveWorkflows[0])
          .mockResolvedValueOnce({ ...liveWorkflows[0], state: "disabled_manually" }),
        disableWorkflow: vi.fn().mockResolvedValue(undefined),
      },
    })).rejects.toThrow("protected main changed during post-disablement verification");
  });
});
