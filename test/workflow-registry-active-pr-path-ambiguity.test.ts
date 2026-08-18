import { describe, expect, it } from "vitest";
import { classifyWorkflowRegistry } from "../scripts/workflow-registry-audit.mjs";

const repository = "ContextualWisdomLab/noema";
const defaultBranchSha = "1fbe857a5cf52b5af31e2db5e4676876289e3e23";
const observedAt = "2026-08-18T00:00:00.000Z";

function classify(registryPath: string, activePullRequestPath: string) {
  return classifyWorkflowRegistry({
    repository,
    defaultBranchSha,
    observedAt,
    workflows: [
      {
        id: 900,
        name: "Bounded repair",
        path: registryPath,
        state: "active",
      },
    ],
    trackedWorkflowPaths: [],
    activePullRequestWorkflowPaths: [activePullRequestPath],
    pagination: {
      totalCount: 1,
      receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    },
  });
}

describe("workflow registry active-PR path ambiguity", () => {
  it("fails closed instead of orphaning a registry path that differs only by case from an active PR path", () => {
    const result = classify(
      ".github/workflows/bounded-current-repair.yml",
      ".github/workflows/Bounded-Current-Repair.yml",
    );

    expect(result.status).toBe("FAIL");
    expect(result.workflows[0]).toMatchObject({
      workflow_id: 900,
      classification: "unresolved_registry_record",
    });
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "active_pr_workflow_path_case_mismatch",
        workflow_id: 900,
      }),
    );
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ code: "active_orphan_workflow" }),
    );
  });

  it("fails closed instead of orphaning a registry path that differs only by Unicode normalization from an active PR path", () => {
    const result = classify(
      ".github/workflows/résumé-repair.yml",
      ".github/workflows/résumé-repair.yml",
    );

    expect(result.status).toBe("FAIL");
    expect(result.workflows[0]).toMatchObject({
      workflow_id: 900,
      classification: "unresolved_registry_record",
    });
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "active_pr_workflow_path_normalization_mismatch",
        workflow_id: 900,
      }),
    );
    expect(result.failures).not.toContainEqual(
      expect.objectContaining({ code: "active_orphan_workflow" }),
    );
  });

  it("still identifies an active orphan when open-PR workflow paths are unrelated", () => {
    const result = classify(
      ".github/workflows/orphaned-repair.yml",
      ".github/workflows/unrelated-current-repair.yml",
    );

    expect(result.status).toBe("FAIL");
    expect(result.workflows[0]).toMatchObject({
      workflow_id: 900,
      classification: "active_orphan",
    });
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "active_orphan_workflow",
        workflow_id: 900,
      }),
    );
  });
});
