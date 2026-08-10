import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { flattenGovernanceRulePages } from "../scripts/maintainer-app-readiness.mjs";
import { REQUIRED_MAIN_CHECK_NAMES } from "../scripts/lib/main-governance-audit.mjs";
import {
  REQUIRED_API_PROBES,
  evaluateMaintainerAppReadiness,
} from "../scripts/lib/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";

function compliantGovernanceRules() {
  return [
    {
      type: "pull_request",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
      parameters: {
        allowed_merge_methods: ["squash"],
        dismiss_stale_reviews_on_push: true,
        require_code_owner_review: false,
        require_last_push_approval: false,
        required_approving_review_count: 0,
        required_review_thread_resolution: true,
      },
    },
    {
      type: "required_status_checks",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
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
      ruleset_source: repository,
    },
    {
      type: "deletion",
      ruleset_id: 101,
      ruleset_source_type: "Repository",
      ruleset_source: repository,
    },
  ];
}

function passingEvidence() {
  return {
    repository,
    maintenanceEnabled: false,
    installationId: 123456,
    appSlug: "noema-maintainer",
    maintainerAccount: {
      login: "noema-maintainer[bot]",
      type: "Bot",
    },
    reviewerAppSlug: "noema-reviewer",
    reviewerInstallationId: 654321,
    reviewerLogin: "noema-reviewer[bot]",
    reviewerAccount: {
      login: "noema-reviewer[bot]",
      type: "Bot",
    },
    accessibleRepositories: [{ full_name: repository }],
    repositoryPermissions: {
      pull: true,
      push: true,
      admin: false,
      maintain: false,
      triage: false,
    },
    apiProbes: Object.fromEntries(REQUIRED_API_PROBES.map((name) => [name, true])),
    governanceReport: {
      repository,
      branch: "main",
      status: "PASS",
    },
    governanceRules: compliantGovernanceRules(),
  };
}

function reasonCodes(result: ReturnType<typeof evaluateMaintainerAppReadiness>) {
  return result.failures.map((failure: { code: string }) => failure.code);
}

describe("maintainer App live-governance binding", () => {
  it("keeps valid retained evidence subordinate to a canonical live-rules PASS", () => {
    const result = evaluateMaintainerAppReadiness(passingEvidence());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
  });

  it("rejects a stored PASS when live governance rules are absent", () => {
    const result = evaluateMaintainerAppReadiness({
      ...passingEvidence(),
      governanceRules: undefined,
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain("live_governance_not_pass");
  });

  it("rejects a stored PASS when the canonical live-rules evaluator fails", () => {
    const result = evaluateMaintainerAppReadiness({
      ...passingEvidence(),
      governanceRules: [],
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain("live_governance_not_pass");
  });

  it("collects fully paginated active main rules instead of trusting only retained status", () => {
    const source = readFileSync("scripts/maintainer-app-readiness.mjs", "utf8");

    expect(source).toContain('"--paginate", "--slurp"');
    expect(source).toContain("rules/branches/main?per_page=100");
    expect(source).toContain("governanceRules");
  });

  it("flattens each active-rules page without dropping later pages", () => {
    const pages = [[{ type: "pull_request" }], [{ type: "deletion" }]];

    expect(flattenGovernanceRulePages(pages)).toEqual([
      { type: "pull_request" },
      { type: "deletion" },
    ]);
  });

  it.each([
    ["non-array response", { rules: [] }],
    ["non-array page", [[{ type: "pull_request" }], { rules: [] }]],
  ])("rejects malformed %s", (_label, pages) => {
    expect(() => flattenGovernanceRulePages(pages)).toThrow(/active main rules/i);
  });
});
