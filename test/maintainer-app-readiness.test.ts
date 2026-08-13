import { describe, expect, it } from "vitest";
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
        required_approving_review_count: 1,
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

describe("maintainer App readiness evaluation", () => {
  it("passes exact identity, disabled activation, scope, probes, and governance evidence", () => {
    const result = evaluateMaintainerAppReadiness(passingEvidence());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.checks.every((check: { pass: boolean }) => check.pass)).toBe(true);
  });

  it.each([
    ["wrong repository", { repository: "ContextualWisdomLab/other" }, "repository_mismatch"],
    ["enabled maintenance", { maintenanceEnabled: true }, "maintenance_already_enabled"],
    ["missing activation evidence", { maintenanceEnabled: undefined }, "maintenance_already_enabled"],
    ["missing installation", { installationId: null }, "installation_id_invalid"],
    ["unsafe installation", { installationId: Number.MAX_SAFE_INTEGER + 1 }, "installation_id_invalid"],
    ["invalid App slug", { appSlug: "Noema Maintainer" }, "app_slug_invalid"],
  ])("fails closed for %s", (_label, patch, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({ ...passingEvidence(), ...patch });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it.each([
    ["wrong login", { login: "other[bot]" }, "maintainer_login_mismatch"],
    ["non-bot type", { type: "User" }, "maintainer_type_invalid"],
  ])("rejects maintainer identity with %s", (_label, patch, expectedCode) => {
    const evidence = passingEvidence();
    evidence.maintainerAccount = { ...evidence.maintainerAccount, ...patch };

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it.each([
    ["missing bot suffix", { reviewerLogin: "noema-reviewer" }, "reviewer_login_invalid"],
    [
      "API login mismatch",
      { reviewerAccount: { login: "other[bot]", type: "Bot" } },
      "reviewer_login_mismatch",
    ],
    [
      "non-bot type",
      { reviewerAccount: { login: "noema-reviewer[bot]", type: "User" } },
      "reviewer_type_invalid",
    ],
  ])("rejects reviewer identity with %s", (_label, patch, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({ ...passingEvidence(), ...patch });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("does not infer installation suspension from public user-profile fields", () => {
    const evidence = passingEvidence();
    evidence.maintainerAccount = {
      ...evidence.maintainerAccount,
      suspended: true,
      suspended_at: "2026-08-04T00:00:00Z",
    } as typeof evidence.maintainerAccount;
    evidence.reviewerAccount = {
      ...evidence.reviewerAccount,
      suspended: true,
      suspended_at: "2026-08-04T00:00:00Z",
    } as typeof evidence.reviewerAccount;

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("PASS");
    expect(result.checks.map((check: { code: string }) => check.code)).not.toEqual(
      expect.arrayContaining(["maintainer_account_suspended", "reviewer_account_suspended"]),
    );
  });

  it("requires distinct maintainer and reviewer identities", () => {
    const evidence = passingEvidence();
    evidence.reviewerLogin = evidence.maintainerAccount.login;
    evidence.reviewerAccount = { ...evidence.maintainerAccount };

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(reasonCodes(result)).toContain("app_identity_not_separated");
  });

  it.each([
    ["no repository", []],
    ["wrong repository", [{ full_name: "ContextualWisdomLab/other" }]],
    ["extra repository", [{ full_name: repository }, { full_name: "ContextualWisdomLab/other" }]],
  ])("rejects effective scope with %s", (_label, accessibleRepositories) => {
    const result = evaluateMaintainerAppReadiness({
      ...passingEvidence(),
      accessibleRepositories,
    });

    expect(reasonCodes(result)).toContain("repository_scope_invalid");
  });

  it.each([
    ["missing pull", { pull: false }, "repository_pull_missing"],
    ["missing push", { push: false }, "repository_push_missing"],
    ["administrator access", { admin: true }, "repository_admin_present"],
  ])("rejects effective permissions with %s", (_label, patch, expectedCode) => {
    const evidence = passingEvidence();
    evidence.repositoryPermissions = { ...evidence.repositoryPermissions, ...patch };

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("rejects unavailable administrator permission evidence", () => {
    const evidence = passingEvidence();
    const result = evaluateMaintainerAppReadiness({
      ...evidence,
      repositoryPermissions: {
        ...evidence.repositoryPermissions,
        admin: null,
      },
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toEqual(expect.arrayContaining([
      "repository_admin_state_invalid",
      "repository_admin_present",
    ]));
  });

  it.each(REQUIRED_API_PROBES)("fails when %s does not pass", (probe) => {
    const evidence = passingEvidence();
    evidence.apiProbes[probe] = false;

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(reasonCodes(result)).toContain(`api_probe_${probe}`);
  });

  it.each([
    ["missing report", null, "governance_report_invalid"],
    [
      "wrong repository",
      { repository: "ContextualWisdomLab/other", branch: "main", status: "PASS" },
      "governance_repository_mismatch",
    ],
    [
      "wrong branch",
      { repository, branch: "release", status: "PASS" },
      "governance_branch_mismatch",
    ],
    [
      "failed status",
      { repository, branch: "main", status: "FAIL" },
      "governance_status_not_pass",
    ],
  ])("rejects governance evidence with %s", (_label, governanceReport, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({ ...passingEvidence(), governanceReport });

    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("accumulates independent failures for a complete audit trail", () => {
    const evidence = passingEvidence();
    evidence.maintenanceEnabled = true;
    evidence.installationId = -1;
    evidence.accessibleRepositories = [];
    evidence.repositoryPermissions.admin = true;
    evidence.apiProbes.actions_read = false;
    evidence.governanceReport.status = "FAIL";

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toEqual(expect.arrayContaining([
      "maintenance_already_enabled",
      "installation_id_invalid",
      "repository_scope_invalid",
      "repository_admin_present",
      "api_probe_actions_read",
      "governance_status_not_pass",
    ]));
  });
});
