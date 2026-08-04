import { describe, expect, it } from "vitest";
import {
  REQUIRED_API_PROBES,
  evaluateMaintainerAppReadiness,
} from "../scripts/lib/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";

function evidenceWithRepositories(accessibleRepositories: Array<{ full_name: string }>) {
  return {
    repository,
    maintenanceEnabled: false,
    installationId: 123456,
    appSlug: "noema-maintainer",
    maintainerAccount: { login: "noema-maintainer[bot]", type: "Bot" },
    reviewerAppSlug: "noema-reviewer",
    reviewerInstallationId: 654321,
    reviewerLogin: "noema-reviewer[bot]",
    reviewerAccount: { login: "noema-reviewer[bot]", type: "Bot" },
    accessibleRepositories,
    repositoryPermissions: {
      pull: true,
      push: true,
      admin: false,
      maintain: false,
      triage: false,
    },
    apiProbes: Object.fromEntries(REQUIRED_API_PROBES.map((name) => [name, true])),
    governanceReport: { repository, branch: "main", status: "PASS" },
  };
}

describe("Maintainer App scope failure privacy", () => {
  it("reports an unexpected repository count without persisting repository names", () => {
    const unexpectedRepository = "ContextualWisdomLab/private-acquisition-target";

    const result = evaluateMaintainerAppReadiness(
      evidenceWithRepositories([
        { full_name: repository },
        { full_name: unexpectedRepository },
      ]),
    );

    const scopeFailure = result.failures.find(
      (failure: { code: string }) => failure.code === "repository_scope_invalid",
    );
    expect(scopeFailure?.detail).toContain("2 accessible repositories");
    expect(JSON.stringify(result)).not.toContain(unexpectedRepository);
  });

  it("single-lines and bounds every retained policy diagnostic", () => {
    const hostileLogin = `attacker\n::error::forged-${"x".repeat(2_000)}[bot]`;
    const evidence = evidenceWithRepositories([{ full_name: repository }]);
    evidence.reviewerLogin = hostileLogin;

    const result = evaluateMaintainerAppReadiness(evidence);
    const details = result.checks.map((check: { detail: string }) => check.detail);

    expect(result.status).toBe("FAIL");
    expect(details.every((detail: string) => detail.length <= 800)).toBe(true);
    expect(details.every((detail: string) => !/[\u0000-\u001f\u007f]/.test(detail))).toBe(true);
    expect(JSON.stringify(result)).not.toContain("x".repeat(1_000));
  });
});
