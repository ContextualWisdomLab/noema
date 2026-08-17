import { describe, expect, it } from "vitest";
import { collectLiveWorkflowRegistryAudit } from "../scripts/workflow-registry-live-audit.mjs";

const repository = "ContextualWisdomLab/noema";
const mainSha = "071d116fff8a856809a3553d57506e6e9703b8b4";
const firstPullHead = "b".repeat(40);
const movedPullHead = "c".repeat(40);
const firstPullBase = "d".repeat(40);
const movedPullBase = "e".repeat(40);

function commonResponse(endpoint: string) {
  if (endpoint === `repos/${repository}/branches/main`) {
    return { commit: { sha: mainSha } };
  }
  if (endpoint === `repos/${repository}/git/trees/${mainSha}?recursive=1`) {
    return { truncated: false, tree: [] };
  }
  if (endpoint === `repos/${repository}/actions/workflows?per_page=100&page=1`) {
    return {
      total_count: 1,
      workflows: [{
        id: 11,
        path: ".github/workflows/bounded-repair.yml",
        state: "active",
      }],
    };
  }
  if (endpoint === `repos/${repository}/pulls/99`) {
    return {
      number: 99,
      head: { sha: firstPullHead },
      base: { sha: firstPullBase },
      changed_files: 1,
    };
  }
  if (endpoint === `repos/${repository}/pulls/99/files?per_page=100&page=1`) {
    return [{ filename: ".github/workflows/bounded-repair.yml" }];
  }
  return undefined;
}

function expectMovingSnapshotFailure(result: Awaited<ReturnType<typeof collectLiveWorkflowRegistryAudit>>) {
  expect(result.status).toBe("FAIL");
  expect(result.failures).toContainEqual(
    expect.objectContaining({ code: "workflow_registry_collection_failed" }),
  );
  expect(String(result.failures[0]?.detail ?? ""))
    .toContain("Open pull-request inventory changed during workflow-path collection");
}

describe("live workflow-registry open-PR snapshot", () => {
  it("fails closed when an open PR head moves while workflow ownership is collected", async () => {
    let pullReads = 0;
    const result = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: "main",
      now: () => "2026-08-18T00:00:00.000Z",
      ghJson: async (endpoint: string) => {
        const common = commonResponse(endpoint);
        if (common !== undefined) return common;
        if (endpoint === `repos/${repository}/pulls?state=open&per_page=100&page=1`) {
          pullReads += 1;
          return [{
            number: 99,
            head: { sha: pullReads === 1 ? firstPullHead : movedPullHead },
            base: { sha: firstPullBase },
          }];
        }
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    });

    expect(pullReads).toBe(2);
    expectMovingSnapshotFailure(result);
  });

  it("fails closed when an open PR base changes while workflow ownership is collected", async () => {
    let pullReads = 0;
    const result = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: "main",
      now: () => "2026-08-18T00:00:00.000Z",
      ghJson: async (endpoint: string) => {
        const common = commonResponse(endpoint);
        if (common !== undefined) return common;
        if (endpoint === `repos/${repository}/pulls?state=open&per_page=100&page=1`) {
          pullReads += 1;
          return [{
            number: 99,
            head: { sha: firstPullHead },
            base: { sha: pullReads === 1 ? firstPullBase : movedPullBase },
          }];
        }
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    });

    expect(pullReads).toBe(2);
    expectMovingSnapshotFailure(result);
  });

  it("fails closed when GitHub's PR-file listing retains fewer files than the PR advertises", async () => {
    const result = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: "main",
      now: () => "2026-08-18T00:00:00.000Z",
      ghJson: async (endpoint: string) => {
        if (endpoint === `repos/${repository}/pulls/99`) {
          return {
            number: 99,
            head: { sha: firstPullHead },
            base: { sha: firstPullBase },
            changed_files: 2,
          };
        }
        const common = commonResponse(endpoint);
        if (common !== undefined) return common;
        if (endpoint === `repos/${repository}/pulls?state=open&per_page=100&page=1`) {
          return [{
            number: 99,
            head: { sha: firstPullHead },
            base: { sha: firstPullBase },
          }];
        }
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_registry_collection_failed" }),
    );
    expect(String(result.failures[0]?.detail ?? ""))
      .toContain("Pull request #99 file inventory retained 1 of 2 advertised changed files");
  });

  it("binds active-PR workflow ownership to the exact immutable head tree despite an ABA-shaped file listing", async () => {
    const result = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: "main",
      now: () => "2026-08-18T00:00:00.000Z",
      ghJson: async (endpoint: string) => {
        if (endpoint === `repos/${repository}/git/trees/${firstPullHead}?recursive=1`) {
          return {
            truncated: false,
            tree: [{ path: ".github/workflows/bounded-repair.yml", type: "blob" }],
          };
        }
        if (endpoint === `repos/${repository}/pulls/99/files?per_page=100&page=1`) {
          return [{ filename: "README.md" }];
        }
        const common = commonResponse(endpoint);
        if (common !== undefined) return common;
        if (endpoint === `repos/${repository}/pulls?state=open&per_page=100&page=1`) {
          return [{
            number: 99,
            head: { sha: firstPullHead },
            base: { sha: firstPullBase },
          }];
        }
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    });

    expect(result.workflows[0]).toMatchObject({
      workflow_id: 11,
      classification: "active_pr_owned",
    });
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ code: "active_orphan_workflow" }),
    );
  });
});
