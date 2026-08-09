import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  REQUIRED_MAIN_CHECK_NAMES,
  evaluateMainGovernanceRules,
} from "../scripts/lib/main-governance-audit.mjs";

function compliantRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
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
        do_not_enforce_on_create: false,
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

function failureCodes(result: ReturnType<typeof evaluateMainGovernanceRules>) {
  return result.failures.map((failure) => failure.code);
}

describe("main governance rules evaluator", () => {
  it("passes a strict integration-pinned main governance contract", () => {
    const result = evaluateMainGovernanceRules(compliantRules());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it("fails closed on non-array evidence", () => {
    const result = evaluateMainGovernanceRules({ rules: [] });

    expect(result.status).toBe("FAIL");
    expect(result.failures).toContainEqual({
      code: "rules_response_invalid",
      detail: "Active main rules must be supplied as an array.",
    });
  });

  it.each([
    ["pull_request", "pull_request_rule_missing"],
    ["required_status_checks", "required_status_checks_rule_missing"],
    ["non_fast_forward", "non_fast_forward_rule_missing"],
    ["deletion", "deletion_rule_missing"],
  ])("fails when the %s rule is absent", (type, expectedCode) => {
    const result = evaluateMainGovernanceRules(
      compliantRules().filter((rule) => rule.type !== type),
    );

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain(expectedCode);
  });

  it("requires stale review dismissal", () => {
    const rules = compliantRules();
    rules[0].parameters.dismiss_stale_reviews_on_push = false;

    const result = evaluateMainGovernanceRules(rules);

    expect(failureCodes(result)).toContain("dismiss_stale_reviews_disabled");
  });

  it("requires at least one independent approval", () => {
    const rules = compliantRules();
    rules[0].parameters.required_approving_review_count = 0;

    const result = evaluateMainGovernanceRules(rules);

    expect(result.failures).toContainEqual({
      code: "independent_approval_not_required",
      detail: "Active pull-request rules do not require at least one approving review.",
    });
  });

  it("requires review-thread resolution", () => {
    const rules = compliantRules();
    rules[0].parameters.required_review_thread_resolution = false;

    const result = evaluateMainGovernanceRules(rules);

    expect(failureCodes(result)).toContain("review_thread_resolution_disabled");
  });

  it("requires squash as an allowed merge method", () => {
    const rules = compliantRules();
    rules[0].parameters.allowed_merge_methods = ["rebase"];

    const result = evaluateMainGovernanceRules(rules);

    expect(failureCodes(result)).toContain("squash_merge_not_allowed");
  });

  it("requires strict current-base status checks", () => {
    const rules = compliantRules();
    rules[1].parameters.strict_required_status_checks_policy = false;

    const result = evaluateMainGovernanceRules(rules);

    expect(failureCodes(result)).toContain("strict_status_policy_disabled");
  });

  it.each(REQUIRED_MAIN_CHECK_NAMES)(
    "requires the %s status context",
    (context) => {
      const rules = compliantRules();
      rules[1].parameters.required_status_checks = rules[1].parameters.required_status_checks
        .filter((check) => check.context !== context);

      const result = evaluateMainGovernanceRules(rules);

      expect(result.failures).toContainEqual({
        code: "required_status_context_missing",
        detail: `Required status context ${context} is not enforced for main.`,
      });
    },
  );

  it("requires every mandatory status source to be pinned to an integration", () => {
    const rules = compliantRules();
    rules[1].parameters.required_status_checks = [
      ...rules[1].parameters.required_status_checks,
      { context: "verify", integration_id: null },
    ];

    const result = evaluateMainGovernanceRules(rules);

    expect(result.failures).toContainEqual({
      code: "required_status_source_unpinned",
      detail: "Required status context verify has a missing or invalid integration_id.",
    });
  });

  it("accepts additional active rules and additional pinned status contexts", () => {
    const rules = compliantRules();
    rules.push({
      type: "required_linear_history",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: "ContextualWisdomLab/noema",
    });
    rules[1].parameters.required_status_checks.push({
      context: "CodeRabbit",
      integration_id: 12_345,
    });

    expect(evaluateMainGovernanceRules(rules).status).toBe("PASS");
  });

  it("combines compatible rules from repository and organization sources", () => {
    const rules = compliantRules();
    rules[0].ruleset_source_type = "Organization";
    rules[0].ruleset_source = "ContextualWisdomLab";
    rules[2].ruleset_id = 202;
    rules[3].ruleset_id = 303;

    expect(evaluateMainGovernanceRules(rules).status).toBe("PASS");
  });

  it("fails malformed rule parameters instead of throwing", () => {
    const rules = compliantRules();
    rules[0].parameters = null;
    rules[1].parameters.required_status_checks = null;

    const result = evaluateMainGovernanceRules(rules);

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain("dismiss_stale_reviews_disabled");
    expect(failureCodes(result)).toContain("required_status_context_missing");
  });
});

describe("repository governance guidance", () => {
  it("documents the live central Security Scan trigger and severity boundary", () => {
    const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");

    expect(agents).not.toContain("It runs on every PR base, **including stacked PRs**.");
    expect(agents).toContain(
      "The central workflow currently selects pull requests whose base branch is `main`, `master`, or `develop`.",
    );
    expect(agents).toContain(
      "A feature-base stacked PR can therefore have no Security Scan run; absence is non-passing evidence",
    );
    expect(agents).toContain("MEDIUM/HIGH/CRITICAL");
    expect(agents).not.toContain("CRITICAL/HIGH, fixable only");
  });
});
