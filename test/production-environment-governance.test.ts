import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { evaluateProductionEnvironment } from "../scripts/lib/production-environment-governance.mjs";

function protectedEnvironment() {
  return {
    id: 12345,
    name: "production",
    html_url: "https://github.com/ContextualWisdomLab/noema/deployments/activity_log?environments_filter=production",
    protection_rules: [
      {
        id: 100,
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [
          {
            type: "Team",
            reviewer: {
              id: 2468,
              slug: "production-approvers",
              name: "Production Approvers",
            },
          },
        ],
      },
      {
        id: 101,
        type: "branch_policy",
      },
    ],
    deployment_branch_policy: {
      protected_branches: true,
      custom_branch_policies: false,
    },
  };
}

function failureCodes(result: ReturnType<typeof evaluateProductionEnvironment>) {
  return result.failures.map((failure) => failure.code);
}

describe("production environment governance", () => {
  it("passes an independently reviewed protected production environment", () => {
    const result = evaluateProductionEnvironment(protectedEnvironment());

    expect(result).toMatchObject({
      status: "PASS",
      reviewer_count: 1,
      reviewers: [
        {
          type: "Team",
          id: 2468,
          identifier: "production-approvers",
        },
      ],
      failures: [],
    });
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it.each([
    ["wrong environment", (value: ReturnType<typeof protectedEnvironment>) => { value.name = "staging"; }, "environment_name_mismatch"],
    ["missing required reviewers", (value: ReturnType<typeof protectedEnvironment>) => { value.protection_rules = value.protection_rules.filter((rule) => rule.type !== "required_reviewers"); }, "required_reviewers_rule_missing"],
    ["empty reviewer set", (value: ReturnType<typeof protectedEnvironment>) => { value.protection_rules[0].reviewers = []; }, "required_reviewers_empty"],
    ["self review allowed", (value: ReturnType<typeof protectedEnvironment>) => { value.protection_rules[0].prevent_self_review = false; }, "self_review_not_prevented"],
    ["missing branch policy rule", (value: ReturnType<typeof protectedEnvironment>) => { value.protection_rules = value.protection_rules.filter((rule) => rule.type !== "branch_policy"); }, "branch_policy_rule_missing"],
    ["unprotected branches", (value: ReturnType<typeof protectedEnvironment>) => { value.deployment_branch_policy.protected_branches = false; }, "protected_branches_not_required"],
    ["custom branch policy", (value: ReturnType<typeof protectedEnvironment>) => { value.deployment_branch_policy.custom_branch_policies = true; }, "custom_branch_policy_enabled"],
  ])("fails closed for %s", (_label, mutate, expectedCode) => {
    const value = protectedEnvironment();
    mutate(value);
    const result = evaluateProductionEnvironment(value);

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain(expectedCode);
  });

  it("fails closed for malformed API data", () => {
    const result = evaluateProductionEnvironment(null);

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain("environment_response_invalid");
  });

  it("uses a shell-free current-version GitHub API audit and bounded evidence", () => {
    const script = readFileSync("scripts/production-environment-governance-audit.mjs", "utf8");

    expect(script).toContain('spawnSync("gh"');
    expect(script).toContain("shell: false");
    expect(script).toContain("X-GitHub-Api-Version: 2026-03-10");
    expect(script).toContain("repos/${repository}/environments/production");
    expect(script).toContain("MAX_GH_OUTPUT_BYTES");
    expect(script).toContain("production_environment_governance_status");
    expect(script).not.toContain("GITHUB_TOKEN");
    expect(script).not.toContain("GH_TOKEN");
  });

  it("blocks CD before credential-bearing deployment steps and retains the report", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const mainRefGuard = workflow.indexOf('GITHUB_REF" != "refs/heads/main"');
    const audit = workflow.indexOf("npm run production:governance");
    const deployment = workflow.indexOf("npm run deploy");

    expect(mainRefGuard).toBeGreaterThan(-1);
    expect(audit).toBeGreaterThan(-1);
    expect(deployment).toBeGreaterThan(-1);
    expect(mainRefGuard).toBeLessThan(audit);
    expect(audit).toBeLessThan(deployment);
    expect(workflow).toContain("production-environment-governance.json");
    expect(workflow).toContain("retention-days: 365");
  });
});
