import { describe, expect, it, vi } from "vitest";
import {
  buildWorkflowDisablementPlan,
  executeWorkflowDisablement,
} from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_BRANCH_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const WORKFLOW_ID = 410;
const WORKFLOW_PATH = ".github/workflows/one-shot-old-repair.yml";

function authoritativePlan() {
  return buildWorkflowDisablementPlan({
    audit: {
      schema_version: 1,
      repository_full_name: REPOSITORY,
      default_branch_sha: DEFAULT_BRANCH_SHA,
      observed_at: "2026-08-15T11:30:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      status: "FAIL",
      failures: [
        {
          code: "active_orphan_workflow",
          workflow_id: WORKFLOW_ID,
          detail: "postcondition fixture",
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

const activeWorkflow = {
  id: WORKFLOW_ID,
  path: WORKFLOW_PATH,
  state: "active",
};

const revalidateDefaultBranch = async () => ({ sha: DEFAULT_BRANCH_SHA });

describe("workflow disablement postcondition", () => {
  it.each([
    {
      name: "the registry still reports the workflow active",
      postState: activeWorkflow,
    },
    {
      name: "the workflow id changes",
      postState: { id: WORKFLOW_ID + 1, path: WORKFLOW_PATH, state: "disabled_manually" },
    },
    {
      name: "the workflow path changes",
      postState: {
        id: WORKFLOW_ID,
        path: ".github/workflows/different.yml",
        state: "disabled_manually",
      },
    },
  ])("fails closed when $name after the mutation callback returns", async ({ postState }) => {
    const plan = authoritativePlan();
    const candidate = plan.disablements[0]!;
    const revalidateWorkflow = vi
      .fn()
      .mockResolvedValueOnce(activeWorkflow)
      .mockResolvedValueOnce(postState);
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate,
        revalidateDefaultBranch,
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).rejects.toThrow("workflow disablement postcondition not observed");

    expect(disableWorkflow).toHaveBeenCalledTimes(1);
    expect(revalidateWorkflow).toHaveBeenCalledTimes(2);
  });

  it("returns only after the exact workflow is observed disabled manually", async () => {
    const plan = authoritativePlan();
    const candidate = plan.disablements[0]!;
    const revalidateWorkflow = vi
      .fn()
      .mockResolvedValueOnce(activeWorkflow)
      .mockResolvedValueOnce({
        id: WORKFLOW_ID,
        path: WORKFLOW_PATH,
        state: "disabled_manually",
      });
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate,
        revalidateDefaultBranch,
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).resolves.toEqual({
      repository_full_name: REPOSITORY,
      workflow_id: WORKFLOW_ID,
      workflow_path: WORKFLOW_PATH,
      prior_state: "active",
      final_state: "disabled_manually",
      mutation: "disable",
    });

    expect(disableWorkflow).toHaveBeenCalledTimes(1);
    expect(revalidateWorkflow).toHaveBeenCalledTimes(2);
  });
});
