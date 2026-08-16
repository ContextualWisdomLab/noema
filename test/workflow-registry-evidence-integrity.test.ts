import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

describe("workflow registry evidence integrity", () => {
  it("rejects an invalid observation time", () => {
    const result = classifyWorkflowRegistry({
      repository: "ContextualWisdomLab/noema",
      defaultBranchSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      observedAt: "invalid",
      workflows: [],
      trackedWorkflowPaths: [],
      activePullRequestWorkflowPaths: [],
      pagination: { totalCount: 0, receipts: [] },
    });
    expect(result.status).toBe("FAIL");
  });
});
