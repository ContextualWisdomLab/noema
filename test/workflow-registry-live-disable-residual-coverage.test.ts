import { describe, expect, it, vi } from "vitest";
import { runWorkflowRegistryDisablement } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const ORPHAN_PATH = ".github/workflows/obsolete-repair.yml";

function validTransport() {
  return {
    revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
    revalidateWorkflow: vi.fn(),
    disableWorkflow: vi.fn(),
  };
}

function activeAudit() {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: "2026-08-16T06:10:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "FAIL",
    failures: [{ code: "active_orphan_workflow", workflow_id: 101 }],
    workflows: [{
      workflow_id: 101,
      workflow_path: ORPHAN_PATH,
      workflow_state: "active",
      classification: "active_orphan",
    }],
  };
}

describe("workflow live-disable residual optional-evidence boundaries", () => {
  it("rejects an absent transport after both fresh collectors are present", async () => {
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn(),
      collectLiveWorkflows: vi.fn(),
    })).rejects.toThrow("missing authorized transport");
  });

  it("treats an absent pre-mutation audit as non-authorizing evidence", async () => {
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn().mockResolvedValue(undefined),
      collectLiveWorkflows: vi.fn().mockResolvedValue([]),
      transport: validTransport(),
    })).rejects.toThrow("fresh workflow disablement plan is non-authorizing: repository_identity_invalid");
  });

  it("rejects a post-audit that retains repository identity but loses protected-main identity", async () => {
    const transport = {
      revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
      revalidateWorkflow: vi
        .fn()
        .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "active" })
        .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "disabled_manually" }),
      disableWorkflow: vi.fn().mockResolvedValue(undefined),
    };
    const collectAudit = vi.fn()
      .mockResolvedValueOnce(activeAudit())
      .mockResolvedValueOnce({ repository_full_name: REPOSITORY });

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport,
    })).rejects.toThrow("protected main changed during post-disablement verification");
  });
});
