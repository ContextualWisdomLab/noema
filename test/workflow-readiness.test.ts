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

  it("grants only the GitHub permissions needed to inspect, dispatch, and merge", () => {
    const workflow = readFileSync(".github/workflows/hourly-commercial-readiness.yml", "utf8");

    for (const permission of [
      "actions: read",
      "checks: read",
      "contents: write",
      "pull-requests: write",
      "security-events: read",
      "statuses: read",
    ]) {
      expect(workflow).toContain(permission);
    }
    expect(workflow).not.toContain("issues: write");
    expect(workflow).not.toContain("id-token: write");
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

  it("runs the mandatory reviewer gate on every pull request", () => {
    const workflow = readFileSync(".github/workflows/reviewer-ci.yml", "utf8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).not.toContain("paths:");
    expect(workflow).toContain("test (100% line+branch coverage gate)");
    expect(workflow).toContain("docstring coverage (100% gate)");
  });
});
