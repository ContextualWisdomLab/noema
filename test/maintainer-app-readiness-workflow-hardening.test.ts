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

  it("writes a bounded dry-run failure artifact when no Maintainer token exists", () => {
    expect(workflow).toContain('code: "maintainer_token_unavailable"');
    expect(workflow).toContain(
      "artifacts/operations/commercial-readiness-loop-dry-run.json",
    );
    expect(workflow).toContain('if [ "$MAINTAINER_APP_OUTCOME" != "success" ]');
    expect(workflow).toContain("process.exit(1);");
  });
});
