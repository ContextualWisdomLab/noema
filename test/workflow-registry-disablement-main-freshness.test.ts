import { describe, expect, it, vi } from "vitest";
import {
  buildWorkflowDisablementPlan,
  executeWorkflowDisablement,
} from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_BRANCH_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const MOVED_BRANCH_SHA = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const WORKFLOW_ID = 410;
const WORKFLOW_PATH = ".github/workflows/one-shot-old-repair.yml";

function authoritativePlan() {
  return buildWorkflowDisablementPlan({
    audit: {
      schema_version: 1,
      repository_full_name: REPOSITORY,
      default_branch_sha: DEFAULT_BRANCH_SHA,
      observed_at: "2026-08-15T12:00:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      status: "FAIL",
      failures: [
        {
          code: "active_orphan_workflow",
          workflow_id: WORKFLOW_ID,
          detail: "protected-main freshness fixture",
        },
      ],
      workflows: [
        {
          workflow_id: WORKFLOW_ID,
          workflow_path: WORKFLOW_PATH,
          workflow_state: "active",
          classification: "active_orphan",
        },
      ],
    },
    expectedRepository: REPOSITORY,
    expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
    liveWorkflows: [
      {
        id: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        state: "active",
      },
    ],
  });
}

function workflowReader() {
  return vi
    .fn()
    .mockResolvedValueOnce({ id: WORKFLOW_ID, path: WORKFLOW_PATH, state: "active" })
    .mockResolvedValueOnce({
      id: WORKFLOW_ID,
      path: WORKFLOW_PATH,
      state: "disabled_manually",
    });
}

describe("workflow disablement protected-main freshness", () => {
  it("refuses mutation when protected main moved after the plan was built", async () => {
    const plan = authoritativePlan();
    const revalidateDefaultBranch = vi.fn(async () => ({ sha: MOVED_BRANCH_SHA }));
    const revalidateWorkflow = workflowReader();
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateDefaultBranch,
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).rejects.toThrow("protected main changed before disablement");

    expect(revalidateDefaultBranch).toHaveBeenCalledOnce();
    expect(revalidateDefaultBranch).toHaveBeenCalledWith({ repository: REPOSITORY });
    expect(revalidateWorkflow).not.toHaveBeenCalled();
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("requires an explicit protected-main revalidation capability", async () => {
    const plan = authoritativePlan();
    const revalidateWorkflow = workflowReader();
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).rejects.toThrow("disablement executor is invalid");

    expect(revalidateWorkflow).not.toHaveBeenCalled();
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("mutates only after protected main and workflow identity both remain exact", async () => {
    const plan = authoritativePlan();
    const revalidateDefaultBranch = vi.fn(async () => ({ sha: DEFAULT_BRANCH_SHA }));
    const revalidateWorkflow = workflowReader();
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateDefaultBranch,
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).resolves.toMatchObject({
      repository_full_name: REPOSITORY,
      workflow_id: WORKFLOW_ID,
      final_state: "disabled_manually",
    });

    expect(revalidateDefaultBranch).toHaveBeenCalledOnce();
    expect(revalidateWorkflow).toHaveBeenCalledTimes(2);
    expect(disableWorkflow).toHaveBeenCalledOnce();
  });
});
