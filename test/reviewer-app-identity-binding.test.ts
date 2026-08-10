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

function reviewerBoundEvidence() {
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

describe("reviewer App identity binding", () => {
  it("rejects a configured reviewer bot that is not bound to the authenticated reviewer App", () => {
    expect(evaluateMaintainerAppReadiness(reviewerBoundEvidence()).status).toBe("PASS");

    const result = evaluateMaintainerAppReadiness({
      ...reviewerBoundEvidence(),
      reviewerAppSlug: "different-reviewer",
    });

    expect(result.status).toBe("FAIL");
    expect(reasonCodes(result)).toContain("reviewer_app_login_mismatch");
  });

  it.each([null, -1, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid reviewer App installation identifier %s",
    (reviewerInstallationId) => {
      const result = evaluateMaintainerAppReadiness({
        ...reviewerBoundEvidence(),
        reviewerInstallationId,
      });

      expect(result.status).toBe("FAIL");
      expect(reasonCodes(result)).toContain("reviewer_installation_id_invalid");
    },
  );

  it.each(["", "Noema Reviewer", "-reviewer", "reviewer-"])(
    "rejects malformed reviewer App slug %j",
    (reviewerAppSlug) => {
      const result = evaluateMaintainerAppReadiness({
        ...reviewerBoundEvidence(),
        reviewerAppSlug,
      });

      expect(result.status).toBe("FAIL");
      expect(reasonCodes(result)).toContain("reviewer_app_slug_invalid");
    },
  );
});
