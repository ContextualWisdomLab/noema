import { describe, expect, it, vi } from "vitest";
import { runWorkflowRegistryDisablement } from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const FIRST_ID = 101;
const SECOND_ID = 102;
const FIRST_PATH = ".github/workflows/obsolete-repair.yml";
const SECOND_PATH = ".github/workflows/legacy-repair.yml";

function initialAudit() {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: "2026-08-28T00:00:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 2, hasNext: false }],
    status: "FAIL",
    failures: [
      {
        code: "active_orphan_workflow",
        workflow_id: FIRST_ID,
        detail: "Active workflow is absent from protected main.",
      },
      {
        code: "active_orphan_workflow",
        workflow_id: SECOND_ID,
        detail: "Active workflow is absent from protected main.",
      },
    ],
    workflows: [
      {
        workflow_id: FIRST_ID,
        workflow_path: FIRST_PATH,
        workflow_state: "active",
        classification: "active_orphan",
      },
      {
        workflow_id: SECOND_ID,
        workflow_path: SECOND_PATH,
        workflow_state: "active",
        classification: "active_orphan",
      },
    ],
  };
}

function postAudit(failures: Array<Record<string, unknown>>) {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: "2026-08-28T00:00:01.000Z",
    pagination_receipts: [{ page: 1, itemCount: 2, hasNext: false }],
    status: "FAIL",
    failures,
    workflows: [
      {
        workflow_id: FIRST_ID,
        workflow_path: FIRST_PATH,
        workflow_state: "disabled_manually",
        classification: "disabled_registry_record",
      },
      {
        workflow_id: SECOND_ID,
        workflow_path: SECOND_PATH,
        workflow_state: "active",
        classification: "active_orphan",
      },
    ],
  };
}

function liveWorkflows() {
  return [
    { id: FIRST_ID, path: FIRST_PATH, state: "active" },
    { id: SECOND_ID, path: SECOND_PATH, state: "active" },
  ];
}

function transport() {
  return {
    revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
    revalidateWorkflow: vi
      .fn()
      .mockResolvedValueOnce({ id: FIRST_ID, path: FIRST_PATH, state: "active" })
      .mockResolvedValueOnce({ id: FIRST_ID, path: FIRST_PATH, state: "disabled_manually" }),
    disableWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

describe("workflow registry post-disablement audit integrity", () => {
  it("rejects an unexpected residual failure instead of returning a verified receipt", async () => {
    const mutationTransport = transport();
    const collectAudit = vi
      .fn()
      .mockResolvedValueOnce(initialAudit())
      .mockResolvedValueOnce(
        postAudit([
          {
            code: "active_orphan_workflow",
            workflow_id: SECOND_ID,
            detail: "Active workflow is absent from protected main.",
          },
          {
            code: "workflow_registry_collection_failed",
            detail: "The post-disablement registry could not be verified completely.",
          },
        ]),
      );

    await expect(
      runWorkflowRegistryDisablement({
        repository: REPOSITORY,
        workflowId: FIRST_ID,
        collectAudit,
        collectLiveWorkflows: vi.fn().mockResolvedValue(liveWorkflows()),
        transport: mutationTransport,
      }),
    ).rejects.toThrow(/unexpected residual failure/i);
    expect(mutationTransport.disableWorkflow).toHaveBeenCalledTimes(1);
  });

  it("rejects a residual active-orphan failure without a valid workflow identity", async () => {
    const mutationTransport = transport();
    const collectAudit = vi
      .fn()
      .mockResolvedValueOnce(initialAudit())
      .mockResolvedValueOnce(
        postAudit([
          {
            code: "active_orphan_workflow",
            workflow_id: "102",
            detail: "Residual workflow identity was malformed.",
          },
        ]),
      );

    await expect(
      runWorkflowRegistryDisablement({
        repository: REPOSITORY,
        workflowId: FIRST_ID,
        collectAudit,
        collectLiveWorkflows: vi.fn().mockResolvedValue(liveWorkflows()),
        transport: mutationTransport,
      }),
    ).rejects.toThrow(/malformed residual active-orphan/i);
    expect(mutationTransport.disableWorkflow).toHaveBeenCalledTimes(1);
  });
});
