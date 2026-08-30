import { describe, expect, it, vi } from "vitest";
import { collectLiveWorkflowRegistryAudit } from "../scripts/workflow-registry-live-audit.mjs";

const observedAt = "2026-08-29T00:00:00.000Z";

describe("workflow registry protected-main SHA authority", () => {
  it.each([
    "not-a-commit-sha",
    "ABCDEF0123456789ABCDEF0123456789ABCDEF01",
    "../../actions/workflows",
  ])("rejects non-canonical protected-main commit authority %s before tree lookup", async (branchSha) => {
    const ghJson = vi.fn(async (endpoint: string) => {
      if (endpoint === "repos/ContextualWisdomLab/noema/branches/main") {
        return { commit: { sha: branchSha } };
      }
      if (endpoint.startsWith("repos/ContextualWisdomLab/noema/git/trees/")) {
        return { truncated: false, tree: [] };
      }
      if (endpoint === "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1") {
        return { total_count: 0, workflows: [] };
      }
      if (endpoint === "repos/ContextualWisdomLab/noema/pulls?state=open&per_page=100&page=1") {
        return [];
      }
      throw new Error(`unexpected endpoint ${endpoint}`);
    });

    const result = await collectLiveWorkflowRegistryAudit({
      repository: "ContextualWisdomLab/noema",
      defaultBranch: "main",
      ghJson,
      now: () => observedAt,
    });

    expect(result.status).toBe("FAIL");
    expect(ghJson.mock.calls.some(([endpoint]) => String(endpoint).includes(`/git/trees/${branchSha}`)))
      .toBe(false);
  });
});
