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

function plan(overrides: Record<string, unknown> = {}) {
  return buildWorkflowDisablementPlan({
    audit: authoritativeAudit(),
    expectedRepository: REPOSITORY,
    expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
    liveWorkflows: matchingLiveRegistry(),
    ...overrides,
  });
}

describe("workflow registry disablement planning", () => {
  it("plans only exact active-orphan identities from authoritative evidence", () => {
    expect(plan()).toEqual({
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
      overrides: {
        audit: authoritativeAudit({ repository_full_name: "ContextualWisdomLab/other" }),
      },
    },
    {
      name: "unsupported expected repository",
      overrides: {
        expectedRepository: "ContextualWisdomLab/other",
        audit: authoritativeAudit({ repository_full_name: "ContextualWisdomLab/other" }),
      },
    },
    {
      name: "default-branch drift",
      overrides: {
        expectedDefaultBranchSha: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    },
    {
      name: "invalid default-branch identity",
      overrides: { expectedDefaultBranchSha: "not-a-sha" },
    },
    {
      name: "missing audit failures",
      overrides: { audit: authoritativeAudit({ failures: undefined }) },
    },
    {
      name: "missing audit workflows",
      overrides: { audit: authoritativeAudit({ workflows: undefined }) },
    },
    {
      name: "missing live registry",
      overrides: { liveWorkflows: undefined },
    },
    {
      name: "non-orphan audit failure",
      overrides: {
        audit: authoritativeAudit({
          failures: [
            ...authoritativeAudit().failures,
            { code: "workflow_pagination_incomplete", detail: "missing page" },
          ],
        }),
      },
    },
    {
      name: "live state changed",
      overrides: {
        liveWorkflows: [
          {
            id: ORPHAN.workflow_id,
            path: ORPHAN.workflow_path,
            state: "disabled_manually",
          },
        ],
      },
    },
    {
      name: "live identity changed",
      overrides: {
        liveWorkflows: [
          {
            id: ORPHAN.workflow_id,
            path: ".github/workflows/current.yml",
            state: "active",
          },
        ],
      },
    },
    {
      name: "live identity missing",
      overrides: { liveWorkflows: [] },
    },
    {
      name: "duplicate live workflow id",
      overrides: { liveWorkflows: [...matchingLiveRegistry(), ...matchingLiveRegistry()] },
    },
    {
      name: "live path is reused by another workflow id",
      overrides: {
        liveWorkflows: [
          ...matchingLiveRegistry(),
          { id: 411, path: ORPHAN.workflow_path, state: "active" },
        ],
      },
    },
  ])("fails closed on $name", ({ overrides }) => {
    const result = plan(overrides);
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
    expect(result.failures.length).toBeGreaterThan(0);
  });

  it.each([
    { name: "unsafe workflow id", workflow: { ...ORPHAN, workflow_id: 0 } },
    { name: "non-string workflow path", workflow: { ...ORPHAN, workflow_path: 123 } },
    { name: "out-of-scope workflow path", workflow: { ...ORPHAN, workflow_path: "README.md" } },
    { name: "non-active audit state", workflow: { ...ORPHAN, workflow_state: "disabled_manually" } },
  ])("rejects malformed active-orphan evidence: $name", ({ workflow }) => {
    const result = plan({
      audit: authoritativeAudit({ workflows: [workflow] }),
    });
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
  });

  it("rejects an active-orphan candidate without its matching audit failure", () => {
    const result = plan({ audit: authoritativeAudit({ failures: [] }) });
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
  });

  it("rejects an active-orphan failure that has no candidate workflow", () => {
    const result = plan({ audit: authoritativeAudit({ workflows: [] }) });
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
  });

  it("sorts a multi-orphan plan deterministically by workflow id", () => {
    const second = {
      workflow_id: 409,
      workflow_path: ".github/workflows/older-one-shot.yml",
      workflow_state: "active",
      classification: "active_orphan",
    };
    const result = plan({
      audit: authoritativeAudit({
        workflows: [ORPHAN, second],
        failures: [
          { code: "active_orphan_workflow", workflow_id: ORPHAN.workflow_id },
          { code: "active_orphan_workflow", workflow_id: second.workflow_id },
        ],
      }),
      liveWorkflows: [
        ...matchingLiveRegistry(),
        { id: second.workflow_id, path: second.workflow_path, state: "active" },
      ],
    });

    expect(result.status).toBe("PASS");
    expect(result.disablements.map((item: { workflow_id: number }) => item.workflow_id)).toEqual([
      409,
      410,
    ]);
  });
});

describe("single workflow disablement execution", () => {
  it("revalidates the exact id, path, and active state immediately before disablement", async () => {
    const currentPlan = plan();
    const candidate = currentPlan.disablements[0]!;
    const revalidateWorkflow = vi.fn(async () => matchingLiveRegistry()[0]);
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan: currentPlan,
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

  it.each([
    { name: "id changed", live: { id: 999, path: ORPHAN.workflow_path, state: "active" } },
    {
      name: "path changed",
      live: { id: ORPHAN.workflow_id, path: ".github/workflows/current.yml", state: "active" },
    },
    {
      name: "state changed",
      live: { id: ORPHAN.workflow_id, path: ORPHAN.workflow_path, state: "disabled_manually" },
    },
  ])("does not mutate when immediate revalidation has $name", async ({ live }) => {
    const currentPlan = plan();
    const candidate = currentPlan.disablements[0]!;
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan: currentPlan,
        candidate,
        revalidateWorkflow: async () => live,
        disableWorkflow,
      }),
    ).rejects.toThrow("workflow identity changed before disablement");

    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "unplanned workflow id",
      candidate: {
        workflow_id: 999,
        workflow_path: ORPHAN.workflow_path,
        expected_state: "active",
      },
    },
    {
      name: "unplanned workflow path",
      candidate: {
        workflow_id: ORPHAN.workflow_id,
        workflow_path: ".github/workflows/not-planned.yml",
        expected_state: "active",
      },
    },
    {
      name: "unplanned expected state",
      candidate: {
        workflow_id: ORPHAN.workflow_id,
        workflow_path: ORPHAN.workflow_path,
        expected_state: "disabled_manually",
      },
    },
  ])("rejects $name", async ({ candidate }) => {
    const disableWorkflow = vi.fn(async () => undefined);
    await expect(
      executeWorkflowDisablement({
        plan: plan(),
        candidate,
        revalidateWorkflow: async () => matchingLiveRegistry()[0],
        disableWorkflow,
      }),
    ).rejects.toThrow("candidate is not part of the exact disablement plan");
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("rejects candidates from a non-passing plan", async () => {
    const failed = plan({ expectedRepository: "ContextualWisdomLab/other" });
    const disableWorkflow = vi.fn(async () => undefined);
    await expect(
      executeWorkflowDisablement({
        plan: failed,
        candidate: {
          workflow_id: ORPHAN.workflow_id,
          workflow_path: ORPHAN.workflow_path,
          expected_state: "active",
        },
        revalidateWorkflow: async () => matchingLiveRegistry()[0],
        disableWorkflow,
      }),
    ).rejects.toThrow("candidate is not part of the exact disablement plan");
    expect(disableWorkflow).not.toHaveBeenCalled();
  });
});