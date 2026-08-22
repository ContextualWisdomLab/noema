import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

const mainSha = "1fbe857a5cf52b5af31e2db5e4676876289e3e23";

function classifyAt(observedAt: string) {
  return classifyWorkflowRegistry({
    repository: "ContextualWisdomLab/noema",
    defaultBranchSha: mainSha,
    observedAt,
    workflows: [],
    trackedWorkflowPaths: [],
    activePullRequestWorkflowPaths: [],
    pagination: {
      totalCount: 0,
      receipts: [],
    },
  });
}

describe("workflow registry observation-time integrity", () => {
  it.each([
    "not-a-timestamp",
    "2026-08-12T14:30:00Z",
    "2026-02-30T12:00:00.000Z",
    "2099-01-01T00:00:00.000Z",
  ])("rejects non-authoritative observation time %s", (observedAt) => {
    const result = classifyAt(observedAt);

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "observation_time_invalid" }),
    );
  });

  it("accepts a canonical UTC observation timestamp that is not in the future", () => {
    const result = classifyAt("2026-08-12T14:30:00.000Z");

    expect(result.status).toBe("PASS");
  });
});
