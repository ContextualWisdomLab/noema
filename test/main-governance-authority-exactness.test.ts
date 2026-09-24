import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_CHECK_INTEGRATION_ID,
  REQUIRED_MAIN_CHECK_NAMES,
  REQUIRED_MAIN_WORKFLOW,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

/** Keep workflow authority canonical except for the one field a hostile case mutates. */
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

/** Supply the minimum pull-request authority needed to distinguish exact type admission from other gaps. */
function strictPullRequestRule() {
  return {
    type: "pull_request",
    parameters: {
      allowed_merge_methods: ["squash"],
      dismiss_stale_reviews_on_push: true,
      required_approving_review_count: 1,
      required_review_thread_resolution: true,
    },
  };
}

/** Supply all mandatory status contexts from the canonical GitHub Actions producer. */
function strictStatusRule() {
  return {
    type: "required_status_checks",
    parameters: {
      strict_required_status_checks_policy: true,
      required_status_checks: REQUIRED_MAIN_CHECK_NAMES.map((context) => ({
        context,
        integration_id: REQUIRED_MAIN_CHECK_INTEGRATION_ID,
      })),
    },
  };
}

/** Collapse bounded audit failures to stable codes for hostile serialization assertions. */
function failureCodes(result: ReturnType<typeof evaluateMainGovernanceRules>) {
  return result.failures.map((failure) => failure.code);
}

describe("governance authority serialization", () => {
  it.each([
    ["path", ` ${REQUIRED_MAIN_WORKFLOW.path}`],
    ["path", `${REQUIRED_MAIN_WORKFLOW.path} `],
    ["ref", ` ${REQUIRED_MAIN_WORKFLOW.ref}`],
    ["ref", `${REQUIRED_MAIN_WORKFLOW.ref} `],
  ])("rejects whitespace-altered required-workflow %s authority", (field, value) => {
    const result = evaluateMainGovernanceRules([
      workflowOnly({ [field]: value }),
    ]);

    expect(failureCodes(result)).toContain("required_security_workflow_missing");
  });

  it("rejects a SHA-pinned workflow presented alongside the canonical branch ref", () => {
    const result = evaluateMainGovernanceRules([
      workflowOnly({ sha: "0123456789abcdef0123456789abcdef01234567" }),
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

  it.each([
    ["pull_request", "pull_request_rule_missing"],
    ["required_status_checks", "required_status_checks_rule_missing"],
    ["non_fast_forward", "non_fast_forward_rule_missing"],
    ["deletion", "deletion_rule_missing"],
  ])("rejects whitespace-altered %s rule type authority", (type, missingCode) => {
    const rule = type === "pull_request"
      ? strictPullRequestRule()
      : type === "required_status_checks"
        ? strictStatusRule()
        : { type };
    rule.type = ` ${type} `;

    const result = evaluateMainGovernanceRules([rule]);

    expect(failureCodes(result)).toContain(missingCode);
  });

  it("rejects a mandatory status context that is canonical only after trimming", () => {
    const rule = strictStatusRule();
    rule.parameters.required_status_checks[0].context = ` ${REQUIRED_MAIN_CHECK_NAMES[0]} `;

    const result = evaluateMainGovernanceRules([rule]);
    const verifyCheck = result.checks.find((check) =>
      check.code === "required_status_context_missing"
      && check.detail.includes(REQUIRED_MAIN_CHECK_NAMES[0]));

    expect(verifyCheck?.pass).toBe(false);
  });

  it("rejects a mandatory status context pinned to a non-GitHub-Actions integration", () => {
    const rule = strictStatusRule();
    rule.parameters.required_status_checks[0].integration_id = 99_999;

    const result = evaluateMainGovernanceRules([rule]);

    expect(failureCodes(result)).toContain("required_status_source_mismatch");
  });
});
