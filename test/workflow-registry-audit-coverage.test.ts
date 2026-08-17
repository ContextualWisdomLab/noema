import { describe, expect, it } from "vitest";
import {
  classifyWorkflowRegistry,
  collectWorkflowRegistryAudit,
  createGhSubprocessEnvironment,
} from "../scripts/workflow-registry-audit.mjs";

const exactSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const observedAt = "2026-08-12T16:10:00.000Z";

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    path: ".github/workflows/ci.yml",
    state: "active",
    ...overrides,
  };
}

function completePagination(totalCount: number, receipts = [
  { page: 1, itemCount: totalCount, hasNext: false },
]) {
  return { totalCount, receipts };
}

function classify(overrides: Record<string, unknown> = {}) {
  return classifyWorkflowRegistry({
    repository: "ContextualWisdomLab/noema",
    defaultBranchSha: exactSha,
    observedAt,
    workflows: [],
    trackedWorkflowPaths: [],
    activePullRequestWorkflowPaths: [],
    pagination: completePagination(0, []),
    ...overrides,
  });
}

function stableBranch() {
  return {
    sha: exactSha,
    workflowPaths: [".github/workflows/ci.yml"],
  };
}

describe("workflow registry audit coverage boundaries", () => {
  it("handles non-string inherited subprocess values without forwarding them", () => {
    expect(
      createGhSubprocessEnvironment({
        PATH: undefined,
        GH_TOKEN: undefined,
      }),
    ).toEqual({ GH_HOST: "github.com", NO_COLOR: "1" });
  });

  it.each([
    [Number.MAX_SAFE_INTEGER + 1, []],
    [0, null],
  ])("rejects malformed pagination envelope variants %#", (totalCount, receipts) => {
    const result = classify({
      pagination: { totalCount, receipts },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_pagination_invalid" }),
    );
  });

  it("accepts a complete zero-record pagination receipt set", () => {
    const result = classify({ pagination: completePagination(0, []) });

    expect(result.status).toBe("PASS");
    expect(result.pagination_receipts).toEqual([]);
  });

  it("rejects a non-integer pagination item count", () => {
    const result = classify({
      workflows: [workflow()],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      pagination: {
        totalCount: 1,
        receipts: [{ page: 1, itemCount: "1", hasNext: false }],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_pagination_invalid" }),
    );
  });

  it.each([
    [workflow({ id: 9, path: null, state: "active" }), 9, null, "active"],
    [workflow({ id: 0, path: ".github/workflows/zero.yml", state: "active" }), 0, ".github/workflows/zero.yml", "active"],
    [workflow({ id: -1, path: ".github/workflows/negative.yml", state: null }), -1, ".github/workflows/negative.yml", null],
  ])(
    "retains only safe diagnostic fields for malformed workflow records %#",
    (record, workflowId, path, state) => {
      const result = classify({
        workflows: [record],
        pagination: completePagination(1),
      });

      expect(result.status).toBe("FAIL");
      expect(result.workflows[0]).toMatchObject({
        workflow_id: workflowId,
        workflow_path: path,
        workflow_state: state,
        classification: "unresolved_registry_record",
      });
    },
  );

  it("uses an explicit unknown state for a structurally valid dynamic record", () => {
    const result = classify({
      workflows: [workflow({ id: 10, path: "dynamic/github-owned", state: null })],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("PASS");
    expect(result.workflows[0]).toMatchObject({
      workflow_state: "unknown",
      classification: "external_or_dynamic_record",
    });
  });

  it("checks every tracked candidate before accepting a case collision", () => {
    const result = classify({
      workflows: [workflow({ id: 11, path: ".github/workflows/CI.yml" })],
      trackedWorkflowPaths: [
        ".github/workflows/cd.yml",
        ".github/workflows/ci.yml",
      ],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_path_case_mismatch" }),
    );
  });

  it("skips malformed records while checking workflow-id reuse", () => {
    const result = classify({
      workflows: [
        workflow({ id: null, path: ".github/workflows/bad-id.yml" }),
        workflow({ id: 12, path: null }),
        workflow({ id: 13, path: ".github/workflows/ci.yml" }),
      ],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      pagination: completePagination(3),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures.filter((failure) => failure.code === "workflow_id_reused")).toEqual([]);
  });

  it("fails closed when called without an input envelope", () => {
    const result = classifyWorkflowRegistry(undefined);

    expect(result).toMatchObject({
      repository_full_name: null,
      default_branch_sha: null,
      observed_at: null,
      pagination_receipts: [],
      status: "FAIL",
    });
    expect(result.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "default_branch_sha_invalid" }),
        expect.objectContaining({ code: "workflow_registry_invalid" }),
        expect.objectContaining({ code: "workflow_pagination_invalid" }),
      ]),
    );
  });

  it("rejects an invalid registry page envelope before classifying records", async () => {
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async () => ({
        totalCount: 1,
        workflows: null,
        hasNext: false,
      }),
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result).toMatchObject({
      status: "FAIL",
      default_branch_sha: exactSha,
      failures: [
        expect.objectContaining({
          code: "workflow_registry_collection_failed",
          http_status: null,
        }),
      ],
    });
  });

  it.each([
    [null],
    [{ totalCount: -1, workflows: [], hasNext: false }],
    [{ totalCount: 0, workflows: [], hasNext: "false" }],
  ])("rejects each malformed page-envelope shape %#", async (pageEnvelope) => {
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async () => pageEnvelope,
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures[0]).toMatchObject({
      code: "workflow_registry_collection_failed",
      http_status: null,
    });
  });

  it("retains a null branch identity when initial branch resolution itself fails", async () => {
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => {
        throw "default branch unavailable";
      },
      listWorkflowPage: async () => ({
        totalCount: 0,
        workflows: [],
        hasNext: false,
      }),
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result).toMatchObject({
      status: "FAIL",
      default_branch_sha: null,
      failures: [
        expect.objectContaining({
          code: "workflow_registry_collection_failed",
          http_status: null,
          detail: "default branch unavailable",
        }),
      ],
    });
  });

  it("fails closed when open-PR workflow ownership cannot be collected", async () => {
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async () => ({
        totalCount: 1,
        workflows: [workflow()],
        hasNext: false,
      }),
      listActivePullRequestWorkflowPaths: async () => {
        throw new Error("pull request ownership unavailable");
      },
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures[0]).toMatchObject({
      code: "workflow_registry_collection_failed",
      http_status: null,
      detail: "pull request ownership unavailable",
    });
  });

  it("fails closed when the final protected-branch recheck cannot be completed", async () => {
    let reads = 0;
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => {
        reads += 1;
        if (reads === 2) throw new Error("final branch read unavailable");
        return stableBranch();
      },
      listWorkflowPage: async () => ({
        totalCount: 1,
        workflows: [workflow()],
        hasNext: false,
      }),
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures[0]).toMatchObject({
      code: "workflow_registry_collection_failed",
      http_status: null,
      detail: "final branch read unavailable",
    });
  });

  it("rejects a changing advertised total across otherwise complete pages", async () => {
    const pages = [
      {
        totalCount: 2,
        workflows: [workflow({ id: 21 })],
        hasNext: true,
      },
      {
        totalCount: 3,
        workflows: [workflow({ id: 22, path: ".github/workflows/cd.yml", state: "disabled_manually" })],
        hasNext: false,
      },
    ];

    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => stableBranch(),
      listWorkflowPage: async ({ page }) => pages[page - 1],
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_pagination_invalid" }),
    );
    expect(result.pagination_receipts).toHaveLength(2);
  });
});
