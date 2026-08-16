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

  function successfulMutationTransport() {
    return {
      revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
      revalidateWorkflow: vi
        .fn()
        .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "active" })
        .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "disabled_manually" }),
      disableWorkflow: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("refuses a post-audit that lacks a schema-v1 PASS/FAIL envelope after identity checks", async () => {
    const disabledIdentity = {
      workflow_id: 101,
      workflow_path: ORPHAN_PATH,
      workflow_state: "disabled_manually",
      classification: "disabled_registry_record",
    };
    const honestBase = {
      ...activeAudit(),
      workflows: [disabledIdentity],
    };

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...honestBase,
          schema_version: 2,
          status: "PASS",
          failures: [],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("full post-disablement audit is not a schema-v1 envelope");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...honestBase,
          status: "UNKNOWN",
          failures: [],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("exact PASS or FAIL status");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...honestBase,
          status: "PASS",
          failures: null,
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("complete failure envelope");
  });

  it("refuses a single-candidate receipt when the disabled workflow remains an active orphan or the audit stays dirty", async () => {
    const disabledIdentity = {
      workflow_id: 101,
      workflow_path: ORPHAN_PATH,
      workflow_state: "disabled_manually",
      classification: "disabled_registry_record",
    };

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...activeAudit(),
          workflows: [disabledIdentity],
          failures: [{ code: "active_orphan_workflow", workflow_id: 101 }],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("still classifies the disabled workflow as an active orphan");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...activeAudit(),
          workflows: [disabledIdentity],
          status: "FAIL",
          failures: [{ code: "active_orphan_workflow", workflow_id: 202 }],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("single-candidate disablement did not produce a clean post-disablement audit");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...activeAudit(),
          workflows: [disabledIdentity],
          status: "PASS",
          failures: [{ code: "unexpected_residual", workflow_id: 202 }],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("PASS status contradicts residual failures");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...activeAudit(),
          workflows: [disabledIdentity],
          status: "FAIL",
          failures: [],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("FAIL status has no residual failures");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce({
          ...activeAudit(),
          workflows: [disabledIdentity],
          status: "PASS",
          failures: [null],
        }),
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: successfulMutationTransport(),
    })).rejects.toThrow("malformed residual failure");
  });
});
