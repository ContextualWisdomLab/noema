import { describe, expect, it } from "vitest";
import {
  REQUIRED_API_PROBES,
  evaluateMaintainerAppReadiness,
} from "../scripts/lib/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";

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
