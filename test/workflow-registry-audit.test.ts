import { describe, expect, it } from "vitest";
import {
  classifyWorkflowRegistry,
  collectWorkflowRegistryAudit,
  createGhSubprocessEnvironment,
} from "../scripts/workflow-registry-audit.mjs";

const mainSha = "1fbe857a5cf52b5af31e2db5e4676876289e3e23";
const observedAt = "2026-08-12T14:30:00.000Z";

function completePagination(totalCount: number) {
  return {
    totalCount,
    receipts: [{ page: 1, itemCount: totalCount, hasNext: false }],
  };
}

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: 100,
    name: "CI",
    path: ".github/workflows/ci.yml",
    state: "active",
    ...overrides,
  };
}

describe("workflow registry audit", () => {
  it("classifies exact protected-tree workflows separately from active orphans", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [
        workflow(),
        workflow({
          id: 200,
          name: "One-shot metadata repair",
          path: ".github/workflows/one-shot-noema-mode-metadata-repair.yml",
        }),
        workflow({
          id: 300,
          name: "Old disabled repair",
          path: ".github/workflows/old-repair.yml",
          state: "disabled_manually",
        }),
      ],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(3),
    });

    expect(result.status).toBe("FAIL");
    expect(result.default_branch_sha).toBe(mainSha);
    expect(result.observed_at).toBe(observedAt);
    expect(result.pagination_receipts).toEqual(completePagination(3).receipts);
    expect(result.workflows).toContainEqual(
      expect.objectContaining({
        workflow_id: 100,
        classification: "present_on_default_branch",
      }),
    );
    expect(result.workflows).toContainEqual(
      expect.objectContaining({
        workflow_id: 200,
        classification: "active_orphan",
      }),
    );
    expect(result.workflows).toContainEqual(
      expect.objectContaining({
        workflow_id: 300,
        classification: "disabled_registry_record",
      }),
    );
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "active_orphan_workflow",
        workflow_id: 200,
      }),
    );
  });

  it("does not call a workflow orphaned when an open PR owns that exact path", () => {
    const path = ".github/workflows/bounded-current-repair.yml";
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow({ id: 400, path })],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [path],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("PASS");
    expect(result.workflows[0]).toMatchObject({
      workflow_id: 400,
      classification: "active_pr_owned",
    });
  });

  it("fails closed on truncated pagination evidence", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow()],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      activePullRequestWorkflowPaths: [],
      pagination: {
        totalCount: 2,
        receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "workflow_pagination_incomplete",
      detail: "Workflow registry pagination retained 1 of 2 advertised records.",
    });
  });

  it.each([
    [{ totalCount: -1, receipts: [] }, "workflow_pagination_invalid"],
    [
      { totalCount: 1, receipts: [{ page: 1, itemCount: -1, hasNext: false }] },
      "workflow_pagination_invalid",
    ],
    [
      { totalCount: 1, receipts: [{ page: 2, itemCount: 1, hasNext: false }] },
      "workflow_pagination_invalid",
    ],
    [
      { totalCount: 1, receipts: [{ page: 1, itemCount: 1, hasNext: true }] },
      "workflow_pagination_incomplete",
    ],
  ])("fails closed on malformed pagination %#", (pagination, code) => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow()],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      activePullRequestWorkflowPaths: [],
      pagination,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(expect.objectContaining({ code }));
  });

  it.each([
    [".github/workflows/CI.yml", "workflow_path_case_mismatch"],
    [".github/workflows/%63i.yml", "workflow_path_encoding_ambiguous"],
  ])("fails closed on ambiguous registry path %s", (path, code) => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow({ id: 500, path })],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(expect.objectContaining({ code }));
  });

  it("keeps GitHub-owned dynamic workflow records outside repository orphan authority", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow({ id: 600, path: "dynamic/github-owned" })],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("PASS");
    expect(result.workflows[0]).toMatchObject({
      workflow_id: 600,
      classification: "external_or_dynamic_record",
    });
  });

  it("classifies both supported disabled registry states", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [
        workflow({
          id: 610,
          path: ".github/workflows/old-manual.yml",
          state: "disabled_manually",
        }),
        workflow({
          id: 611,
          path: ".github/workflows/old-idle.yml",
          state: "disabled_inactivity",
        }),
      ],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(2),
    });

    expect(result.status).toBe("PASS");
    expect(result.workflows.map((entry) => entry.classification)).toEqual([
      "disabled_registry_record",
      "disabled_registry_record",
    ]);
  });

  it("fails closed on an unsupported repository workflow state", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [workflow({ id: 620, state: "mystery" })],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_state_unresolved" }),
    );
    expect(result.workflows[0].workflow_state).toBe("mystery");
  });

  it("fails closed on malformed workflow records without crashing", () => {
    const result = classifyWorkflowRegistry({
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [{ id: null, path: null, state: null }],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(1),
    });

    expect(result.status).toBe("FAIL");
    expect(result.repository_full_name).toBeNull();
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_record_invalid" }),
    );
    expect(result.workflows[0]).toMatchObject({
      workflow_id: null,
      workflow_path: null,
      workflow_state: null,
      classification: "unresolved_registry_record",
    });
  });

  it("fails closed when the workflow registry or pagination envelope is absent", () => {
    const result = classifyWorkflowRegistry({
      defaultBranchSha: mainSha,
      observedAt,
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
    });

    expect(result.status).toBe("FAIL");
    expect(result.pagination_receipts).toEqual([]);
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_registry_invalid" }),
    );
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_pagination_invalid" }),
    );
  });

  it("fails closed when one workflow id is reused for conflicting paths", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [
        workflow({ id: 700, path: ".github/workflows/ci.yml" }),
        workflow({ id: 700, path: ".github/workflows/cd.yml" }),
      ],
      trackedWorkflowPaths: [
        ".github/workflows/ci.yml",
        ".github/workflows/cd.yml",
      ],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(2),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "workflow_id_reused",
        workflow_id: 700,
      }),
    );
  });

  it("allows duplicate observations of the same id/path without inventing reuse", () => {
    const duplicate = workflow({ id: 710, path: ".github/workflows/ci.yml" });
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: mainSha,
      observedAt,
      workflows: [duplicate, duplicate],
      trackedWorkflowPaths: [".github/workflows/ci.yml"],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(2),
    });

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
  });

  it("rejects branch identity that is not exact lowercase 40-hex", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: "not-a-sha",
      observedAt,
      workflows: [],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: completePagination(0),
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "default_branch_sha_invalid" }),
    );
  });

  it("collects every registry page and binds the snapshot to a stable protected-main read", async () => {
    const resolveDefaultBranch = async () => ({
      sha: mainSha,
      workflowPaths: [".github/workflows/ci.yml"],
    });
    const pages = [
      {
        totalCount: 2,
        workflows: [workflow()],
        hasNext: true,
      },
      {
        totalCount: 2,
        workflows: [
          workflow({
            id: 800,
            path: ".github/workflows/one-shot.yml",
            state: "disabled_manually",
          }),
        ],
        hasNext: false,
      },
    ];

    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch,
      listWorkflowPage: async ({ page }) => pages[page - 1],
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result.status).toBe("PASS");
    expect(result.default_branch_sha).toBe(mainSha);
    expect(result.pagination_receipts).toEqual([
      { page: 1, itemCount: 1, hasNext: true },
      { page: 2, itemCount: 1, hasNext: false },
    ]);
  });

  it("fails closed when protected main moves during collection", async () => {
    let call = 0;
    const result = await collectWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      resolveDefaultBranch: async () => ({
        sha: call++ === 0 ? mainSha : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        workflowPaths: [".github/workflows/ci.yml"],
      }),
      listWorkflowPage: async () => ({
        totalCount: 1,
        workflows: [workflow()],
        hasNext: false,
      }),
      listActivePullRequestWorkflowPaths: async () => [],
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "default_branch_moved" }),
    );
  });

  it.each([403, 404, 500, 503])(
    "fails closed when workflow registry collection returns HTTP %s",
    async (status) => {
      const error = Object.assign(new Error(`HTTP ${status}`), { status });
      const result = await collectWorkflowRegistryAudit({
        repository: "ContextualWisdomLab/noema",
        resolveDefaultBranch: async () => ({
          sha: mainSha,
          workflowPaths: [".github/workflows/ci.yml"],
        }),
        listWorkflowPage: async () => {
          throw error;
        },
        listActivePullRequestWorkflowPaths: async () => [],
        now: () => observedAt,
      });

      expect(result.status).toBe("FAIL");
      expect(result.failures).toContainEqual(
        expect.objectContaining({
          code: "workflow_registry_collection_failed",
          http_status: status,
        }),
      );
      expect(result.workflows).toEqual([]);
    },
  );

  it("passes only reviewed GitHub CLI authority to a read-only collector", () => {
    const child = createGhSubprocessEnvironment({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-token",
      GITHUB_TOKEN: "ambient-github-token",
      NVIDIA_NIM_API_KEY: "model-secret",
      HOME: "/tmp/host-home",
      HTTPS_PROXY: "http://proxy.invalid",
      NODE_OPTIONS: "--import=/tmp/preload.mjs",
    });

    expect(child).toEqual({
      PATH: "/usr/bin:/bin",
      GH_TOKEN: "read-only-token",
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("does not synthesize a path or token when the parent has none", () => {
    expect(createGhSubprocessEnvironment()).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
    expect(createGhSubprocessEnvironment({ PATH: "", GH_TOKEN: "" })).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });
});
