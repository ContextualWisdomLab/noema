import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(".github/workflows/maintainer-app-readiness.yml", "utf8");

describe("maintainer App readiness workflow", () => {
  it("runs only from an event-bound default-branch commit", () => {
    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("types: [maintainer-app-readiness]");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).toContain("ref: ${{ github.sha }}");
    expect(workflow).not.toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("persist-credentials: false");
  });

  it("mints separate repository-scoped Maintainer and Reviewer App tokens", () => {
    expect(workflow.match(/actions\/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1/g)).toHaveLength(2);
    expect(workflow).toContain("client-id: ${{ vars.NOEMA_MAINTAINER_APP_CLIENT_ID }}");
    expect(workflow).toContain("private-key: ${{ secrets.NOEMA_MAINTAINER_APP_PRIVATE_KEY }}");
    expect(workflow).toContain("client-id: ${{ vars.NOEMA_GITHUB_APP_CLIENT_ID }}");
    expect(workflow).toContain("private-key: ${{ secrets.NOEMA_GITHUB_APP_PRIVATE_KEY }}");
    expect(workflow.match(/owner: ContextualWisdomLab/g)).toHaveLength(2);
    expect(workflow.match(/repositories: noema/g)).toHaveLength(2);
    expect(workflow).toContain("permission-actions: read");
    expect(workflow).toContain("permission-checks: read");
    expect(workflow).toContain("permission-contents: write");
    expect(workflow).toContain("permission-metadata: read");
    expect(workflow).toContain("permission-pull-requests: write");
    expect(workflow).toContain("permission-statuses: read");
    expect(workflow).not.toContain("permission-administration");

    const reviewerStart = workflow.indexOf("mint repository-scoped Reviewer App identity token");
    const setupStart = workflow.indexOf("setup Node.js");
    const reviewerBlock = workflow.slice(reviewerStart, setupStart);
    expect(reviewerStart).toBeGreaterThan(0);
    expect(setupStart).toBeGreaterThan(reviewerStart);
    expect(reviewerBlock).toContain("permission-metadata: read");
    expect(reviewerBlock).not.toContain("permission-contents: write");
    expect(reviewerBlock).not.toContain("permission-pull-requests: write");
    expect(workflow).not.toContain("GH_TOKEN: ${{ steps.reviewer_app.outputs.token }}");
  });

  it("passes authenticated Reviewer App identity outputs to the evaluator", () => {
    expect(workflow).toContain("NOEMA_REVIEWER_APP_SLUG: ${{ steps.reviewer_app.outputs.app-slug }}");
    expect(workflow).toContain("NOEMA_REVIEWER_INSTALLATION_ID: ${{ steps.reviewer_app.outputs.installation-id }}");
    expect(workflow).toContain("NOEMA_REVIEWER_LOGIN: ${{ vars.NOEMA_REVIEWER_LOGIN }}");
  });

  it("orders gates and requires all evidence artifacts", () => {
    const governance = workflow.indexOf("audit active main governance");
    const readiness = workflow.indexOf("audit effective Maintainer App identity and access");
    const dryRun = workflow.indexOf("inspect commercial-readiness loop without writes");
    const enforcement = workflow.indexOf("enforce pre-activation gates");

    expect(governance).toBeGreaterThan(0);
    expect(readiness).toBeGreaterThan(governance);
    expect(dryRun).toBeGreaterThan(readiness);
    expect(enforcement).toBeGreaterThan(dryRun);
    expect(workflow).toContain("node scripts/maintainer-app-readiness.mjs");
    expect(workflow).toContain("NOEMA_MAINTENANCE_ENABLED: ${{ vars.NOEMA_MAINTENANCE_ENABLED }}");
    expect(workflow).toContain("scripts/hourly-commercial-readiness.mjs");
    expect(workflow).not.toContain("--apply");
    expect(workflow.match(/if-no-files-found: error/g)).toHaveLength(3);
    expect(workflow).not.toContain("if-no-files-found: warn");
    expect(workflow).toContain("retention-days: 90");
  });

  it("documents the evidence boundary and operational rollback posture", () => {
    const documentation = readFileSync("docs/maintainer-app-readiness-audit.md", "utf8");

    expect(documentation).toContain("effective installation token");
    expect(documentation).toContain("complete underlying GitHub App registration");
    expect(documentation).toContain("installation suspension state");
    expect(documentation).toContain("Reviewer App");
    expect(documentation).toContain("reviewer_app_login_mismatch");
    expect(documentation).toContain("event-bound default-branch commit");
    expect(documentation).toContain("maintenance_already_enabled");
    expect(documentation).toContain("issue #29");
    expect(documentation).toContain("issue #27");
    expect(documentation).toContain("GITHUB_TOKEN");
    expect(documentation).toContain("--apply");
    expect(documentation).toContain("100 records per page");
    expect(documentation).toContain("does not persist unexpected repository names");
    expect(documentation).toContain("does not run `npm ci`");
  });
});
