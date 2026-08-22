import { describe, expect, it } from "vitest";
import { buildWorkflowDisablementPlan } from "../scripts/workflow-registry-disable-plan.mjs";

const repository = "ContextualWisdomLab/noema";
const mainSha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const orphan = {
  workflow_id: 410,
  workflow_path: ".github/workflows/one-shot-old-repair.yml",
  workflow_state: "active",
  classification: "active_orphan",
};

function planAt(observedAt: string) {
  return buildWorkflowDisablementPlan({
    expectedRepository: repository,
    expectedDefaultBranchSha: mainSha,
    audit: {
      schema_version: 1,
      repository_full_name: repository,
      default_branch_sha: mainSha,
      observed_at: observedAt,
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      status: "FAIL",
      failures: [{ code: "active_orphan_workflow", workflow_id: orphan.workflow_id }],
      workflows: [orphan],
    },
    liveWorkflows: [{
      id: orphan.workflow_id,
      path: orphan.workflow_path,
      state: "active",
    }],
  });
}

describe("workflow disablement observation-time authority", () => {
  it("rejects future-dated registry evidence before it can authorize mutation", () => {
    const result = planAt("2099-01-01T00:00:00.000Z");

    expect(result.status).toBe("FAIL");
    expect(result.disablements).toEqual([]);
    expect(result.failures).toContainEqual(
      expect.objectContaining({ code: "disablement_audit_not_authoritative" }),
    );
  });

  it("preserves canonical non-future evidence as eligible planning input", () => {
    const result = planAt("2026-08-14T03:30:00.000Z");

    expect(result.status).toBe("PASS");
    expect(result.disablements).toHaveLength(1);
  });
});
