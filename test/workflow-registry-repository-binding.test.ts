import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

const validInput = {
  defaultBranchSha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  observedAt: "2026-08-13T15:00:00.000Z",
  workflows: [],
  trackedWorkflowPaths: [],
  activePullRequestWorkflowPaths: [],
  pagination: { totalCount: 0, receipts: [] },
};

describe("workflow registry repository binding", () => {
  it.each([
    "ContextualWisdomLab/other",
    "contextualwisdomlab/noema",
    " ContextualWisdomLab/noema ",
    null,
  ])(
    "rejects evidence bound to %s",
    (repository) => {
      const result = classifyWorkflowRegistry({ ...validInput, repository });

      expect(result.status).toBe("FAIL");
      expect(result.failures).toContainEqual({
        code: "repository_identity_invalid",
        detail:
          "Workflow registry evidence must be bound to exact repository ContextualWisdomLab/noema.",
      });
    },
  );
});