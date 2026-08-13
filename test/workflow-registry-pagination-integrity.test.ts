import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

describe("workflow registry pagination integrity", () => {
  it("rejects an ambiguous continuation marker", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      observedAt: "2026-08-13T12:00:00.000Z",
      workflows: [],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: {
        totalCount: 0,
        receipts: [{ page: 1, itemCount: 0, hasNext: "false" }],
      },
    });
    expect(result.status).toBe("FAIL");
  });
});
