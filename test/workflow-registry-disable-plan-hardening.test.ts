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

function audit(overrides: Record<string, unknown> = {}) {
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

function build(overrides: Record<string, unknown> = {}) {
  return buildWorkflowDisablementPlan({
    audit: audit(),
    expectedRepository: REPOSITORY,
    expectedDefaultBranchSha: DEFAULT_BRANCH_SHA,
    liveWorkflows: [
      {
        id: ORPHAN.workflow_id,
        path: ORPHAN.workflow_path,
        state: "active",
      },
    ],
    ...overrides,
  });
}

function forgedPassingPlan() {
  return {
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
  };
}

describe("workflow disablement authority hardening", () => {
  it.each([
    { name: "missing schema version", audit: audit({ schema_version: undefined }) },
    { name: "unsupported schema version", audit: audit({ schema_version: 2 }) },
    { name: "non-failing audit status", audit: audit({ status: "PASS" }) },
    { name: "missing observation time", audit: audit({ observed_at: undefined }) },
    { name: "invalid observation time", audit: audit({ observed_at: "not-a-date" }) },
    { name: "missing pagination receipts", audit: audit({ pagination_receipts: undefined }) },
    { name: "empty pagination receipts", audit: audit({ pagination_receipts: [] }) },
    {
      name: "incomplete pagination",
      audit: audit({ pagination_receipts: [{ page: 1, itemCount: 100, hasNext: true }] }),
    },
    {
      name: "non-sequential pagination",
      audit: audit({
        pagination_receipts: [
          { page: 1, itemCount: 100, hasNext: true },
          { page: 3, itemCount: 1, hasNext: false },
        ],
      }),
    },
    {
      name: "empty orphan authority",
      audit: audit({ failures: [], workflows: [] }),
    },
  ])("rejects $name", ({ audit: untrustedAudit }) => {
    const result = build({ audit: untrustedAudit });
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
  });

  it.each([
    ".github/workflows/../current.yml",
    ".github/workflows//orphan.yml",
    ".github/workflows/orphan.txt",
    ".github/workflows/orphan.yml/child",
    ".github/workflows/./orphan.yml",
    ".github/workflows/orphan\\repair.yml",
  ])("rejects a non-canonical workflow path %s", (workflowPath) => {
    const candidate = { ...ORPHAN, workflow_path: workflowPath };
    const result = build({
      audit: audit({ workflows: [candidate] }),
      liveWorkflows: [{ id: ORPHAN.workflow_id, path: workflowPath, state: "active" }],
    });
    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
  });

  it.each([
    {
      name: "different repository",
      plan: {
        ...forgedPassingPlan(),
        repository_full_name: "ContextualWisdomLab/other",
      },
    },
    {
      name: "invalid protected-main SHA",
      plan: {
        ...forgedPassingPlan(),
        default_branch_sha: "not-a-sha",
      },
    },
    {
      name: "unsafe planned workflow path",
      plan: {
        ...forgedPassingPlan(),
        disablements: [
          {
            workflow_id: ORPHAN.workflow_id,
            workflow_path: ".github/workflows/../current.yml",
            expected_state: "active",
          },
        ],
      },
    },
    {
      name: "structurally valid but unauthenticated plan",
      plan: forgedPassingPlan(),
    },
    {
      name: "serialized clone of an authentic plan",
      plan: structuredClone(build()),
    },
  ])("does not execute a forged PASS plan with $name", async ({ plan }) => {
    const revalidateWorkflow = vi.fn(async () => ({
      id: ORPHAN.workflow_id,
      path: ORPHAN.workflow_path,
      state: "active",
    }));
    const disableWorkflow = vi.fn(async () => undefined);

    await expect(
      executeWorkflowDisablement({
        plan,
        candidate: plan.disablements[0],
        revalidateWorkflow,
        disableWorkflow,
      }),
    ).rejects.toThrow("disablement plan authority is invalid");
    expect(revalidateWorkflow).not.toHaveBeenCalled();
    expect(disableWorkflow).not.toHaveBeenCalled();
  });

  it("returns an immutable in-process plan authority", () => {
    const plan = build();
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.disablements)).toBe(true);
    expect(Object.isFrozen(plan.disablements[0])).toBe(true);
    expect(Object.isFrozen(plan.failures)).toBe(true);
  });
});
