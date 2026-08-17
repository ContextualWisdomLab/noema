import { describe, expect, it } from "vitest";
import { collectLiveWorkflowRegistryAudit } from "../scripts/workflow-registry-live-audit.mjs";

const repository = "ContextualWisdomLab/noema";
const mainSha = "071d116fff8a856809a3553d57506e6e9703b8b4";
const firstPullHead = "b".repeat(40);
const movedPullHead = "c".repeat(40);

describe("live workflow-registry open-PR snapshot", () => {
  it("fails closed when an open PR head moves while workflow ownership is collected", async () => {
    let pullReads = 0;
    const result = await collectLiveWorkflowRegistryAudit({
      repository,
      defaultBranch: "main",
      now: () => "2026-08-18T00:00:00.000Z",
      ghJson: async (endpoint: string) => {
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
        if (endpoint === `repos/${repository}/pulls?state=open&per_page=100&page=1`) {
          pullReads += 1;
          return [{
            number: 99,
            head: { sha: pullReads === 1 ? firstPullHead : movedPullHead },
          }];
        }
        if (endpoint === `repos/${repository}/pulls/99/files?per_page=100&page=1`) {
          return [{ filename: ".github/workflows/bounded-repair.yml" }];
        }
        throw new Error(`unexpected endpoint ${endpoint}`);
      },
    });

    expect(pullReads).toBe(2);
    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "workflow_registry_collection_failed" }),
    );
    expect(String(result.failures[0]?.detail ?? ""))
      .toContain("Open pull-request inventory changed during workflow-path collection");
  });
});
