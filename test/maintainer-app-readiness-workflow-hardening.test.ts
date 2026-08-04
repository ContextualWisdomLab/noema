import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  ".github/workflows/maintainer-app-readiness.yml",
  "utf8",
);

describe("maintainer App readiness workflow hardening", () => {
  it("invokes reviewed Node entrypoints directly without npm lifecycle hooks", () => {
    expect(workflow).not.toContain("npm ci");
    expect(workflow).not.toContain("npm install");
    expect(workflow).not.toContain("npm run");
    expect(workflow).toContain("node scripts/main-governance-audit.mjs");
    expect(workflow).toContain("node scripts/maintainer-app-readiness.mjs");
  });

  it("continues after either App token mint fails so bounded failure artifacts can be written", () => {
    const maintainerStart = workflow.indexOf("mint repository-scoped Maintainer App token");
    const reviewerStart = workflow.indexOf("mint repository-scoped Reviewer App identity token");
    const setupStart = workflow.indexOf("setup Node.js");
    const maintainerBlock = workflow.slice(maintainerStart, reviewerStart);
    const reviewerBlock = workflow.slice(reviewerStart, setupStart);

    expect(maintainerBlock).toContain("continue-on-error: true");
    expect(reviewerBlock).toContain("continue-on-error: true");
    expect(workflow).toContain("MAINTAINER_APP_OUTCOME: ${{ steps.maintainer_app.outcome }}");
    expect(workflow).toContain("REVIEWER_APP_OUTCOME: ${{ steps.reviewer_app.outcome }}");
    expect(workflow).toContain(
      "for gate in MAINTAINER_APP_OUTCOME REVIEWER_APP_OUTCOME GOVERNANCE_OUTCOME READINESS_OUTCOME DRY_RUN_OUTCOME",
    );
  });

  it("writes bounded evidence when no Maintainer token exists or the dry-run command fails early", () => {
    expect(workflow).toContain('code: reasonCode');
    expect(workflow).toContain('reasonCode="maintainer_token_unavailable"');
    expect(workflow).toContain('reasonCode="commercial_loop_failed"');
    expect(workflow).toContain(
      "artifacts/operations/commercial-readiness-loop-dry-run.json",
    );
    expect(workflow).toContain('if [ "$MAINTAINER_APP_OUTCOME" != "success" ]');
    expect(workflow).toContain('if [ "$loop_status" -ne 0 ] && [ ! -s "$report_path" ]');
    expect(workflow).toContain('exit "$loop_status"');
  });

  it("normalizes missing, oversized, or malformed dry-run evidence before artifact upload", () => {
    expect(workflow).toContain("normalize bounded commercial-loop evidence");
    expect(workflow).toContain("const MAX_REPORT_BYTES = 1_048_576;");
    expect(workflow).toContain("JSON.parse(raw)");
    expect(workflow).toContain("report.schemaVersion !== 1");
    expect(workflow).toContain("report.repository !== EXPECTED_REPOSITORY");
    expect(workflow).toContain("report.apply !== false");
    expect(workflow).toContain("dry_run_report_invalid");
    expect(workflow).toContain(
      "DRY_RUN_EVIDENCE_OUTCOME: ${{ steps.dry_run_evidence.outcome }}",
    );
    expect(workflow).toContain(
      "for gate in MAINTAINER_APP_OUTCOME REVIEWER_APP_OUTCOME GOVERNANCE_OUTCOME READINESS_OUTCOME DRY_RUN_OUTCOME DRY_RUN_EVIDENCE_OUTCOME",
    );
  });
});
