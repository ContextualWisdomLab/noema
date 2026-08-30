import { describe, expect, it, vi } from "vitest";

import { runWorkflowRegistryDisablement } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const WORKFLOW_ID = 101;
const WORKFLOW_PATH = ".github/workflows/orphan.yml";

function activeOrphanAudit(defaultBranchSha: string, workflowId = WORKFLOW_ID, workflowPath = WORKFLOW_PATH) {
  return {
    schema_version: 1,
    status: "FAIL",
    repository_full_name: REPOSITORY,
    default_branch_sha: defaultBranchSha,
    observed_at: "2026-08-16T00:00:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    workflows: [{
      workflow_id: workflowId,
      workflow_path: workflowPath,
      workflow_state: "active",
      classification: "active_orphan",
    }],
    failures: [{ code: "active_orphan_workflow", workflow_id: workflowId }],
  };
}

describe("workflow registry pre-mutation authority", () => {
  it("refuses mutation when protected-main identity changes in the immediate pre-mutation audit", async () => {
    const initialSha = "a".repeat(40);
    const initialAudit = activeOrphanAudit(initialSha);
    const disableWorkflow = vi.fn();
    let auditCalls = 0;

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: WORKFLOW_ID,
      collectAudit: async () => {
        auditCalls += 1;
        return auditCalls === 1
          ? initialAudit
          : activeOrphanAudit("b".repeat(40));
      },
      collectLiveWorkflows: async () => [{ id: WORKFLOW_ID, path: WORKFLOW_PATH, state: "active" }],
      transport: {
        revalidateDefaultBranch: vi.fn(),
        revalidateWorkflow: vi.fn(),
        disableWorkflow,
      },
    })).rejects.toThrow(
      "pre-mutation workflow disablement plan is non-authorizing: default_branch_identity_changed",
    );

    expect(auditCalls).toBe(2);
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("refuses mutation when the immediate pre-mutation audit loses its workflow collection", async () => {
    const defaultBranchSha = "d".repeat(40);
    const initialAudit = activeOrphanAudit(defaultBranchSha);
    const malformedAudit = {
      ...activeOrphanAudit(defaultBranchSha),
      workflows: null,
    };
    const disableWorkflow = vi.fn();
    let auditCalls = 0;

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: WORKFLOW_ID,
      collectAudit: async () => {
        auditCalls += 1;
        return auditCalls === 1 ? initialAudit : malformedAudit;
      },
      collectLiveWorkflows: async () => [{ id: WORKFLOW_ID, path: WORKFLOW_PATH, state: "active" }],
      transport: {
        revalidateDefaultBranch: vi.fn(),
        revalidateWorkflow: vi.fn(),
        disableWorkflow,
      },
    })).rejects.toThrow(
      "requested workflow is not an exact active-orphan candidate after pre-mutation refresh",
    );

    expect(auditCalls).toBe(2);
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("refuses mutation when audit identity changes after the refreshed record check but before plan membership", async () => {
    const defaultBranchSha = "c".repeat(40);
    const initialAudit = activeOrphanAudit(defaultBranchSha);
    const replacementId = 202;
    const replacementPath = ".github/workflows/replacement.yml";
    const preMutationAudit = activeOrphanAudit(defaultBranchSha) as ReturnType<typeof activeOrphanAudit>;
    const mutableWorkflows = preMutationAudit.workflows;
    const guardedWorkflow = {
      workflow_id: WORKFLOW_ID,
      workflow_path: WORKFLOW_PATH,
      workflow_state: "active",
      get classification() {
        preMutationAudit.workflows = [{
          workflow_id: replacementId,
          workflow_path: replacementPath,
          workflow_state: "active",
          classification: "active_orphan",
        }];
        preMutationAudit.failures = [{ code: "active_orphan_workflow", workflow_id: replacementId }];
        return "active_orphan";
      },
    };
    mutableWorkflows[0] = guardedWorkflow;

    const disableWorkflow = vi.fn();
    let auditCalls = 0;
    let liveCalls = 0;

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: WORKFLOW_ID,
      collectAudit: async () => {
        auditCalls += 1;
        return auditCalls === 1 ? initialAudit : preMutationAudit;
      },
      collectLiveWorkflows: async () => {
        liveCalls += 1;
        return liveCalls === 1
          ? [{ id: WORKFLOW_ID, path: WORKFLOW_PATH, state: "active" }]
          : [{ id: replacementId, path: replacementPath, state: "active" }];
      },
      transport: {
        revalidateDefaultBranch: vi.fn(),
        revalidateWorkflow: vi.fn(),
        disableWorkflow,
      },
    })).rejects.toThrow(
      "requested workflow is not an exact active-orphan candidate after pre-mutation refresh",
    );

    expect(auditCalls).toBe(2);
    expect(liveCalls).toBe(2);
    expect(disableWorkflow).not.toHaveBeenCalled();
  });
});
