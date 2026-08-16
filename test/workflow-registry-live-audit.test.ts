import { describe, expect, it, vi } from "vitest";
import {
  collectLiveWorkflowRegistryAudit,
  repositoryWorkflowPathsFromTree,
  workflowPageFromResponse,
} from "../scripts/workflow-registry-live-audit.mjs";

const mainSha = "071d116fff8a856809a3553d57506e6e9703b8b4";
const observedAt = "2026-08-16T00:00:00.000Z";

describe("live workflow-registry collector", () => {
  it("rejects truncated protected-main trees instead of under-classifying workflows", () => {
    expect(() => repositoryWorkflowPathsFromTree({ truncated: true, tree: [] }))
      .toThrow("truncated");
  });

  it("retains only exact repository workflow blobs from the protected-main tree", () => {
    expect(repositoryWorkflowPathsFromTree({
      truncated: false,
      tree: [
        { path: ".github/workflows/ci.yml", type: "blob" },
        { path: ".github/workflows/subdir", type: "tree" },
        { path: "docs/workflows.md", type: "blob" },
      ],
    })).toEqual([".github/workflows/ci.yml"]);
  });

  it("derives continuation from the advertised registry total", () => {
    expect(workflowPageFromResponse({
      total_count: 150,
      workflows: [{ id: 1, path: ".github/workflows/ci.yml", state: "active" }],
    }, 1, 100)).toEqual({
      totalCount: 150,
      workflows: [{ id: 1, path: ".github/workflows/ci.yml", state: "active" }],
      hasNext: true,
    });
  });

  it("collects registry pages, active-PR workflow ownership, and exact protected-main identity", async () => {
    const calls: string[] = [];
    let branchReads = 0;
    const ghJson = vi.fn(async (endpoint: string) => {
      calls.push(endpoint);
      if (endpoint === "repos/ContextualWisdomLab/noema/branches/main") {
        branchReads += 1;
        return { commit: { sha: mainSha } };
      }
      if (endpoint === `repos/ContextualWisdomLab/noema/git/trees/${mainSha}?recursive=1`) {
        return {
          truncated: false,
          tree: [
            { path: ".github/workflows/ci.yml", type: "blob" },
            { path: "README.md", type: "blob" },
          ],
        };
      }
      if (endpoint === "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1") {
        return {
          total_count: 2,
          workflows: [
            { id: 10, path: ".github/workflows/ci.yml", state: "active" },
            { id: 11, path: ".github/workflows/bounded-repair.yml", state: "active" },
          ],
        };
      }
      if (endpoint === "repos/ContextualWisdomLab/noema/pulls?state=open&per_page=100&page=1") {
        return [{ number: 99 }];
      }
      if (endpoint === "repos/ContextualWisdomLab/noema/pulls/99/files?per_page=100&page=1") {
        return [{ filename: ".github/workflows/bounded-repair.yml" }];
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await collectLiveWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      defaultBranch: "main",
      ghJson,
      now: () => observedAt,
    });

    expect(branchReads).toBe(2);
    expect(result.status).toBe("PASS");
    expect(result.default_branch_sha).toBe(mainSha);
    expect(result.observed_at).toBe(observedAt);
    expect(result.pagination_receipts).toEqual([
      { page: 1, itemCount: 2, hasNext: false },
    ]);
    expect(result.workflows).toContainEqual(expect.objectContaining({
      workflow_id: 11,
      classification: "active_pr_owned",
    }));
    expect(calls).toContain(`repos/ContextualWisdomLab/noema/git/trees/${mainSha}?recursive=1`);
  });

  it("fails closed when the protected branch moves during collection", async () => {
    let branchRead = 0;
    const ghJson = async (endpoint: string) => {
      if (endpoint === "repos/ContextualWisdomLab/noema/branches/main") {
        branchRead += 1;
        return {
          commit: {
            sha: branchRead === 1
              ? mainSha
              : "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
        };
      }
      if (endpoint.startsWith("repos/ContextualWisdomLab/noema/git/trees/")) {
        return { truncated: false, tree: [] };
      }
      if (endpoint.includes("/actions/workflows?")) {
        return { total_count: 0, workflows: [] };
      }
      if (endpoint.includes("/pulls?state=open")) return [];
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    const result = await collectLiveWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      defaultBranch: "main",
      ghJson,
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: "default_branch_moved",
    }));
  });

  it("fails closed on registry API errors without silently treating them as no workflows", async () => {
    const ghJson = async (endpoint: string) => {
      if (endpoint === "repos/ContextualWisdomLab/noema/branches/main") {
        return { commit: { sha: mainSha } };
      }
      if (endpoint.startsWith("repos/ContextualWisdomLab/noema/git/trees/")) {
        return { truncated: false, tree: [] };
      }
      if (endpoint.includes("/actions/workflows?")) {
        throw Object.assign(new Error("HTTP 403"), { status: 403 });
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    };

    const result = await collectLiveWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      defaultBranch: "main",
      ghJson,
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(expect.objectContaining({
      code: "workflow_registry_collection_failed",
      http_status: 403,
    }));
  });
});
