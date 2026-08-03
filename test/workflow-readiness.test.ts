import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment workflow readiness gates", () => {
  it("uses a Node runtime compatible with current Cloudflare dependencies", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/cd.yml",
      ".github/workflows/readiness-scan.yml",
      ".github/workflows/acquisition-readiness-scan.yml",
      ".github/workflows/hourly-commercial-readiness.yml",
      ".github/workflows/maintainer-app-readiness.yml",
    ]) {
      const workflow = readFileSync(path, "utf8");

      expect(workflow).toContain('node-version: "24"');
      expect(workflow).not.toContain('node-version: "20"');
    }
  });

  it("runs production evidence preflight before strict release verification", () => {
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const preflightIndex = workflow.indexOf("npm run production:preflight");
    const releaseVerifyIndex = workflow.indexOf("npm run release:verify:strict");

    expect(preflightIndex).toBeGreaterThan(-1);
    expect(releaseVerifyIndex).toBeGreaterThan(-1);
    expect(preflightIndex).toBeLessThan(releaseVerifyIndex);
  });

  it("keeps scheduled evidence audits report-only while manual gates fail closed", () => {
    const readinessWorkflow = readFileSync(".github/workflows/readiness-scan.yml", "utf8");
    const acquisitionWorkflow = readFileSync(".github/workflows/acquisition-readiness-scan.yml", "utf8");

    expect(readinessWorkflow).toContain("NOEMA_AUDIT_REPORT_ONLY: ${{ github.event_name == 'schedule' && '1' || '0' }}");
    expect(acquisitionWorkflow).toContain("NOEMA_AUDIT_REPORT_ONLY: ${{ github.event_name == 'schedule' && '1' || '0' }}");
  });

  it("keeps scheduled readiness scans non-blocking while preserving manual strict failure", () => {
    const workflow = readFileSync(".github/workflows/readiness-scan.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("npm run readiness:audit");
    expect(workflow).toContain("NOEMA_AUDIT_REPORT_ONLY");
    expect(workflow).toContain("Report-only mode only suppresses external evidence gaps");
  });

  it("keeps scheduled acquisition scans non-blocking while preserving manual strict failure", () => {
    const workflow = readFileSync(".github/workflows/acquisition-readiness-scan.yml", "utf8");

    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("schedule:");
    expect(workflow).toContain("npm run acquisition:audit");
    expect(workflow).toContain("NOEMA_AUDIT_REPORT_ONLY");
    expect(workflow).toContain("Report-only mode only suppresses external evidence gaps");
  });

  it("runs the commercial-readiness loop hourly from trusted default-branch code", () => {
    const workflow = readFileSync(".github/workflows/hourly-commercial-readiness.yml", "utf8");

    expect(workflow).toContain('cron: "17 * * * *"');
    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("types: [commercial-readiness-loop]");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("group: noema-hourly-commercial-readiness");
    expect(workflow).toContain("cancel-in-progress: true");
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("node scripts/hourly-commercial-readiness.mjs --apply");
  });

  it("uses a dedicated maintainer App token so merges trigger downstream workflows", () => {
    const workflow = readFileSync(".github/workflows/hourly-commercial-readiness.yml", "utf8");

    expect(workflow).toContain("if: vars.NOEMA_MAINTENANCE_ENABLED == 'true'");
    expect(workflow).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(workflow).toContain("NOEMA_MAINTAINER_APP_CLIENT_ID");
    expect(workflow).toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
    expect(workflow).toContain("NOEMA_REVIEWER_LOGIN");
    for (const permission of [
      "permission-actions: read",
      "permission-checks: read",
      "permission-contents: write",
      "permission-metadata: read",
      "permission-pull-requests: write",
      "permission-statuses: read",
    ]) {
      expect(workflow).toContain(permission);
    }
    expect(workflow).toContain("GH_TOKEN: ${{ steps.maintainer_app.outputs.token }}");
    expect(workflow).not.toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("id-token: write");
    expect(workflow).not.toContain("permission-administration:");
  });

  it("fails closed on live main governance before any review dispatch or merge", () => {
    const workflow = readFileSync(".github/workflows/hourly-commercial-readiness.yml", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const governanceIndex = workflow.indexOf("npm run governance:audit");
    const loopIndex = workflow.indexOf("node scripts/hourly-commercial-readiness.mjs --apply");

    expect(packageJson.scripts["governance:audit"]).toBe("node scripts/main-governance-audit.mjs");
    expect(governanceIndex).toBeGreaterThan(-1);
    expect(loopIndex).toBeGreaterThan(-1);
    expect(governanceIndex).toBeLessThan(loopIndex);
    expect(workflow).toContain("verify active main governance before any write");
    expect(workflow).toContain("NOEMA_GOVERNANCE_AUDIT_PATH: artifacts/governance/main-governance-audit.json");
    expect(workflow).toContain("name: main-governance-audit");
    expect(workflow).toContain("path: artifacts/governance/main-governance-audit.json");
    expect(workflow).toContain("if: always() && steps.loop.outcome != 'skipped'");
  });

  it("refreshes report-only commercial evidence only after the PR queue reaches zero", () => {
    const workflow = readFileSync(".github/workflows/hourly-commercial-readiness.yml", "utf8");

    expect(workflow).toContain("steps.loop.outputs.remaining_open_pull_request_count == '0'");
    expect(workflow).toContain('NOEMA_AUDIT_REPORT_ONLY: "1"');
    expect(workflow).toContain("npm run readiness:audit");
    expect(workflow).toContain("npm run acquisition:manifest");
    expect(workflow).toContain("npm run acquisition:audit");
    expect(workflow).toContain("name: commercial-readiness-loop-report");
    expect(workflow).toContain("name: no-pr-commercial-readiness-evidence");
    expect(workflow).toContain("if: always()");
  });

  it("audits the maintainer App from default-branch code without enabling writes", () => {
    const workflow = readFileSync(".github/workflows/maintainer-app-readiness.yml", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
    const governanceIndex = workflow.indexOf("npm run governance:audit");
    const readinessIndex = workflow.indexOf("npm run operations:preflight");
    const dryRunIndex = workflow.indexOf("node scripts/hourly-commercial-readiness.mjs --report");

    expect(workflow).toContain("repository_dispatch:");
    expect(workflow).toContain("types: [maintainer-app-readiness]");
    expect(workflow).not.toContain("workflow_dispatch:");
    expect(workflow).not.toContain("pull_request_target:");
    expect(workflow).not.toContain("pull_request:");
    expect(workflow).toContain("ref: ${{ github.event.repository.default_branch }}");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).not.toContain("GH_TOKEN: ${{ github.token }}");
    expect(workflow).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    for (const permission of [
      "permission-actions: read",
      "permission-checks: read",
      "permission-contents: write",
      "permission-metadata: read",
      "permission-pull-requests: write",
      "permission-statuses: read",
    ]) {
      expect(workflow).toContain(permission);
    }
    expect(workflow).not.toContain("permission-administration:");
    expect(workflow).toContain("NOEMA_MAINTAINER_APP_SLUG: ${{ steps.maintainer_app.outputs.app-slug }}");
    expect(workflow).toContain("NOEMA_MAINTAINER_INSTALLATION_ID: ${{ steps.maintainer_app.outputs.installation-id }}");
    expect(packageJson.scripts["operations:preflight"]).toBe("node scripts/maintainer-app-readiness.mjs");
    expect(governanceIndex).toBeGreaterThan(-1);
    expect(readinessIndex).toBeGreaterThan(governanceIndex);
    expect(dryRunIndex).toBeGreaterThan(readinessIndex);
    expect(workflow).not.toContain("hourly-commercial-readiness.mjs --apply");
    expect(workflow).toContain("commercial-readiness-loop-dry-run.json");
    expect(workflow).toContain("name: main-governance-audit");
    expect(workflow).toContain("name: maintainer-app-readiness");
    expect(workflow).toContain("name: commercial-readiness-loop-dry-run");
    expect(workflow).toContain("if: always()");
  });

  it("runs the mandatory reviewer gate on every pull request", () => {
    const workflow = readFileSync(".github/workflows/reviewer-ci.yml", "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).not.toContain("paths:");
    expect(workflow).toContain("test (100% line+branch coverage gate)");
    expect(workflow).toContain("docstring coverage (100% gate)");
  });
});
