import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_WORKFLOW,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

function workflowOnly(overrides: Record<string, unknown> = {}) {
  return {
    type: "workflows",
    ruleset_id: 18_794_436,
    ruleset_source_type: REQUIRED_MAIN_WORKFLOW.ruleset_source_type,
    ruleset_source: REQUIRED_MAIN_WORKFLOW.ruleset_source,
    parameters: {
      workflows: [
        {
          repository_id: REQUIRED_MAIN_WORKFLOW.repository_id,
          path: REQUIRED_MAIN_WORKFLOW.path,
          ref: REQUIRED_MAIN_WORKFLOW.ref,
          ...overrides,
        },
      ],
    },
  };
}

function failureCodes(result: ReturnType<typeof evaluateMainGovernanceRules>) {
  return result.failures.map((failure) => failure.code);
}

describe("canonical required-workflow identity", () => {
  it.each([
    ["path", ` ${REQUIRED_MAIN_WORKFLOW.path}`],
    ["path", `${REQUIRED_MAIN_WORKFLOW.path} `],
    ["ref", ` ${REQUIRED_MAIN_WORKFLOW.ref}`],
    ["ref", `${REQUIRED_MAIN_WORKFLOW.ref} `],
  ])("rejects whitespace-altered %s authority", (field, value) => {
    const result = evaluateMainGovernanceRules([
      workflowOnly({ [field]: value }),
    ]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
  });

  it.each([
    [" Organization", REQUIRED_MAIN_WORKFLOW.ruleset_source],
    ["Organization ", REQUIRED_MAIN_WORKFLOW.ruleset_source],
    [REQUIRED_MAIN_WORKFLOW.ruleset_source_type, ` ${REQUIRED_MAIN_WORKFLOW.ruleset_source}`],
    [REQUIRED_MAIN_WORKFLOW.ruleset_source_type, `${REQUIRED_MAIN_WORKFLOW.ruleset_source} `],
  ])("rejects whitespace-altered ruleset source authority", (sourceType, source) => {
    const rule = workflowOnly();
    rule.ruleset_source_type = sourceType;
    rule.ruleset_source = source;

    const result = evaluateMainGovernanceRules([rule]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
  });

  it("rejects a whitespace-altered workflows rule type", () => {
    const rule = workflowOnly();
    rule.type = " workflows ";

    const result = evaluateMainGovernanceRules([rule]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
    expect(result.observed_controls.required_workflows).toEqual([]);
  });
});
