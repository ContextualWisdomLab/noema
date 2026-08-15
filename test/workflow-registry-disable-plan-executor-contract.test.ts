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
      observed_at: "2026-08-14T03:30:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      status: "FAIL",
      failures: [
        {
          code: "active_orphan_workflow",
          workflow_id: WORKFLOW_ID,
          detail: "bounded executor capability fixture",
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

describe("workflow disablement executor capability contract", () => {
  it("refuses a missing live-revalidation capability before any mutation", async () => {
    const plan = authoritativePlan();
    expect(plan.status).toBe("PASS");
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        disableWorkflow,
      }),
    ).rejects.toThrow("disablement executor is invalid");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("refuses a missing disable capability before performing live revalidation", async () => {
    const plan = authoritativePlan();
    expect(plan.status).toBe("PASS");
    const revalidateWorkflow = vi.fn(async () => ({
      id: WORKFLOW_ID,
      path: WORKFLOW_PATH,
      state: "active",
    }));

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateWorkflow,
      }),
    ).rejects.toThrow("disablement executor is invalid");

    expect(revalidateWorkflow).not.toHaveBeenCalled();
  });
});
