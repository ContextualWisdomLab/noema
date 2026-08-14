import { describe, expect, it, vi } from "vitest";
import {
  buildWorkflowDisablementPlan,
  executeWorkflowDisablement,
} from "../scripts/workflow-registry-disable-plan.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const DEFAULT_BRANCH_SHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const ORPHAN = {
  workflow_id: 410,
  workflow_path: ".github/workflows/one-shot-old-repair.yml",
  workflow_state: "active",
  classification: "active_orphan",
};

function authoritativeAudit(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: DEFAULT_BRANCH_SHA,
    observed_at: "2026-08-14T03:30:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "FAIL",
    failures: [
      {
        code: "active_orphan_workflow",
        workflow_id: ORPHAN.workflow_id,
        detail: "bounded test orphan",
      },
    ],
    workflows: [ORPHAN],
    ...overrides,
  };
}

function matchingLiveRegistry() {
  return [
    {
      id: ORPHAN.workflow_id,
      path: ORPHAN.workflow_path,
      state: "active",
    },
  ];
}

describe("workflow registry disablement planning", () => {
  it("plans only exact active-orphan identities from authoritative evidence", () => {
    const result = buildWorkflowDisablementPlan({
      audit: authoritativeAudit(),
      expectedRepository: REPOSITORY,
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    });

    expect(result).toEqual({
      status: "PASS",
      repository_full_name: REPOSITORY,
      default_branch_sha: DEFAULT_BRANCH_SHA,
      disablements: [
        {
          workflow_id: ORPHAN.workflow_id,
          workflow_path: ORPHAN.workflow_path,
          expected_state: "active",
        },
      ],
      failures: [],
    });
  });

  it.each([
    {
      name: "repository drift",
      audit: authoritativeAudit({ repository_full_name: "ContextualWisdomLab/other" }),
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    },
    {
      name: "default-branch drift",
      audit: authoritativeAudit(),
      expectedDefaultBranchSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      liveWorkflows: matchingLiveRegistry(),
    },
    {
      name: "non-orphan audit failure",
      audit: authoritativeAudit({
        failures: [
          ...authoritativeAudit().failures,
          { code: "workflow_pagination_incomplete", detail: "missing page" },
        ],
      }),
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    },
    {
      name: "live state changed",
      audit: authoritativeAudit(),
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: [
        {
          id: ORPHAN.workflow_id,
          path: ORPHAN.workflow_path,
          state: "disabled_manually",
        },
      ],
    },
    {
      name: "live identity changed",
      audit: authoritativeAudit(),
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: [
        {
          id: ORPHAN.workflow_id,
          path: ".github/workflows/current.yml",
          state: "active",
        },
      ],
    },
  ])("fails closed on $name", ({ audit, expectedDefaultBranchSha, liveWorkflows }) => {
    const result = buildWorkflowDisablementPlan({
      audit,
      expectedRepository: REPOSITORY,
      expectedDefaultBranchSha,
      liveWorkflows,
    });

    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
    expect(result.failures.length).toBeGreaterThan(0);
  });
});

describe("single workflow disablement execution", () => {
  it("revalidates the exact id, path, and active state immediately before disablement", async () => {
    const plan = buildWorkflowDisablementPlan({
      audit: authoritativeAudit(),
      expectedRepository: REPOSITORY,
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    });
    const candidate = plan.disablements[0]!;
    const revalidateWorkflow = vi.fn(async () => matchingLiveRegistry()[0]);
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate,
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).resolves.toEqual({
      repository_full_name: REPOSITORY,
      workflow_id: ORPHAN.workflow_id,
      workflow_path: ORPHAN.workflow_path,
      prior_state: "active",
      mutation: "disable",
    });

    expect(revalidateWorkflow).toHaveBeenCalledWith({
      repository: REPOSITORY,
      workflowId: ORPHAN.workflow_id,
    });
    expect(disableWorkflow).toHaveBeenCalledWith({
      repository: REPOSITORY,
      workflowId: ORPHAN.workflow_id,
    });
  });

  it("does not mutate when immediate revalidation no longer matches the plan", async () => {
    const plan = buildWorkflowDisablementPlan({
      audit: authoritativeAudit(),
      expectedRepository: REPOSITORY,
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    });
    const candidate = plan.disablements[0]!;
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate,
        revalidateWorkflow: async () => ({
          id: ORPHAN.workflow_id,
          path: ORPHAN.workflow_path,
          state: "disabled_manually",
        }),
        disableWorkflow,
      }),
    ).rejects.toThrow("workflow identity changed before disablement");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("rejects candidates that are not part of a passing plan", async () => {
    const plan = buildWorkflowDisablementPlan({
      audit: authoritativeAudit(),
      expectedRepository: REPOSITORY,
      expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
      liveWorkflows: matchingLiveRegistry(),
    });
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: {
          workflow_id: 999,
          workflow_path: ".github/workflows/not-planned.yml",
          expected_state: "active",
        },
        revalidateWorkflow: async () => ({ id: 999, path: "x", state: "active" }),
        disableWorkflow,
      }),
    ).rejects.toThrow("candidate is not part of the exact disablement plan");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });
});
