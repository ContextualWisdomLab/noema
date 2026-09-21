import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_CHECK_NAMES,
  REQUIRED_MAIN_WORKFLOW,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

function otherwiseCompliantRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        required_approving_review_count: 1,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        strict_required_status_checks_policy: true,
        required_status_checks: REQUIRED_MAIN_CHECK_NAMES.map((context, index) => ({
          context,
          integration_id: 15_368 + index,
        })),
      },
    },
    {
      type: "non_fast_forward",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
    {
      type: "deletion",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    },
  ];
}

function canonicalWorkflowRule() {
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
        },
      ],
    },
  };
}

function failureCodes(result: ReturnType<typeof evaluateMainGovernanceRules>) {
  return result.failures.map((failure) => failure.code);
}

describe("main governance required workflow", () => {
  it("rejects otherwise compliant governance when the canonical central Security Scan workflow is absent", () => {
    const result = evaluateMainGovernanceRules(otherwiseCompliantRules());

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "required_security_workflow_missing",
      detail: "The canonical organization-owned central Security Scan workflow is not enforced for main.",
    });
  });

  it("accepts the exact organization-owned central Security Scan workflow", () => {
    const result = evaluateMainGovernanceRules([
      ...otherwiseCompliantRules(),
      canonicalWorkflowRule(),
    ]);

    expect(result.status).toBe("PASS");
    expect(failureCodes(result)).not.toContain("required_security_workflow_missing");
  });

  it.each([
    ["repository_id", 1],
    ["path", ".github/workflows/other.yml"],
    ["ref", "refs/heads/develop"],
  ])("rejects a lookalike required workflow with the wrong %s", (field, value) => {
    const workflowRule = canonicalWorkflowRule();
    workflowRule.parameters.workflows[0][field] = value;

    const result = evaluateMainGovernanceRules([
      ...otherwiseCompliantRules(),
      workflowRule,
    ]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
  });

  it.each([
    ["ruleset_source_type", "Repository"],
    ["ruleset_source", "ContextualWisdomLab/noema"],
  ])("rejects the canonical workflow path when %s does not identify the organization owner", (field, value) => {
    const workflowRule = canonicalWorkflowRule();
    workflowRule[field] = value;

    const result = evaluateMainGovernanceRules([
      ...otherwiseCompliantRules(),
      workflowRule,
    ]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
  });

  it("fails closed when the workflows payload is malformed", () => {
    const workflowRule = canonicalWorkflowRule();
    workflowRule.parameters.workflows = null;

    const result = evaluateMainGovernanceRules([
      ...otherwiseCompliantRules(),
      workflowRule,
    ]);

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain("required_security_workflow_missing");
    expect(result.observed_controls.required_workflows).toEqual([]);
  });
});
