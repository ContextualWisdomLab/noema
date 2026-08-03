import { describe, expect, it } from "vitest";
import {
  REQUIRED_API_PROBES,
  evaluateMaintainerAppReadiness,
} from "../scripts/lib/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";

function passingEvidence() {
  return {
    repository,
    installationId: 123456,
    appSlug: "noema-maintainer",
    maintainerAccount: {
      login: "noema-maintainer[bot]",
      type: "Bot",
      suspended: false,
    },
    reviewerLogin: "noema-reviewer[bot]",
    reviewerAccount: {
      login: "noema-reviewer[bot]",
      type: "Bot",
      suspended: false,
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
  };
}

function reasonCodes(result: ReturnType<typeof evaluateMaintainerAppReadiness>) {
  return result.failures.map((failure) => failure.code);
}

describe("maintainer App readiness evaluation", () => {
  it("passes exact scoped identity, access, probe, and governance evidence", () => {
    const result = evaluateMaintainerAppReadiness(passingEvidence());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it.each([
    ["invalid repository", { repository: "outside/noema" }, "repository_invalid"],
    ["missing installation id", { installationId: null }, "installation_id_invalid"],
    ["zero installation id", { installationId: 0 }, "installation_id_invalid"],
    ["invalid App slug", { appSlug: "Noema Maintainer" }, "app_slug_invalid"],
  ])("fails closed on %s", (_label, patch, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({ ...passingEvidence(), ...patch });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it.each([
    ["wrong login", { login: "other[bot]" }, "maintainer_login_mismatch"],
    ["non-bot type", { type: "User" }, "maintainer_type_invalid"],
    ["suspended account", { suspended: true }, "maintainer_account_suspended"],
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
      { reviewerAccount: { login: "other[bot]", type: "Bot", suspended: false } },
      "reviewer_login_mismatch",
    ],
    [
      "non-bot type",
      { reviewerAccount: { login: "noema-reviewer[bot]", type: "User", suspended: false } },
      "reviewer_type_invalid",
    ],
    [
      "suspended account",
      { reviewerAccount: { login: "noema-reviewer[bot]", type: "Bot", suspended: true } },
      "reviewer_account_suspended",
    ],
  ])("rejects reviewer identity with %s", (_label, patch, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({ ...passingEvidence(), ...patch });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("requires maintainer and reviewer Apps to be distinct", () => {
    const evidence = passingEvidence();
    evidence.reviewerLogin = evidence.maintainerAccount.login;
    evidence.reviewerAccount = { ...evidence.maintainerAccount };

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain("app_identity_not_separated");
  });

  it.each([
    ["missing accessible repository", [], "repository_scope_invalid"],
    [
      "extra accessible repository",
      [{ full_name: repository }, { full_name: "ContextualWisdomLab/other" }],
      "repository_scope_invalid",
    ],
    ["wrong accessible repository", [{ full_name: "ContextualWisdomLab/other" }], "repository_scope_invalid"],
  ])("rejects %s", (_label, accessibleRepositories, expectedCode) => {
    const result = evaluateMaintainerAppReadiness({
      ...passingEvidence(),
      accessibleRepositories,
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it.each([
    ["missing pull", { pull: false }, "repository_pull_missing"],
    ["missing push", { push: false }, "repository_push_missing"],
    ["unexpected admin", { admin: true }, "repository_admin_present"],
  ])("rejects repository permission state with %s", (_label, patch, expectedCode) => {
    const evidence = passingEvidence();
    evidence.repositoryPermissions = { ...evidence.repositoryPermissions, ...patch };

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it.each(REQUIRED_API_PROBES.map((probe) => ({ probe })))(
    "fails when $probe does not pass",
    ({ probe }) => {
      const evidence = passingEvidence();
      evidence.apiProbes[probe] = false;

      const result = evaluateMaintainerAppReadiness(evidence);

      expect(result.status).toBe("FAIL");
      expect(result.failures).toContainEqual({
        code: "api_probe_failed",
        detail: `Required GitHub API probe ${probe} did not pass.`,
      });
    },
  );

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
    const result = evaluateMaintainerAppReadiness({
      ...passingEvidence(),
      governanceReport,
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain(expectedCode);
  });

  it("accumulates independent fail-closed failures", () => {
    const evidence = passingEvidence();
    evidence.installationId = -1;
    evidence.accessibleRepositories = [];
    evidence.repositoryPermissions.admin = true;
    evidence.apiProbes.actions_read = false;
    evidence.governanceReport.status = "FAIL";

    const result = evaluateMaintainerAppReadiness(evidence);

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toEqual(expect.arrayContaining([
      "installation_id_invalid",
      "repository_scope_invalid",
      "repository_admin_present",
      "api_probe_failed",
      "governance_status_not_pass",
    ]));
  });
});
