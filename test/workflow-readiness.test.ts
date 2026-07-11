import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment workflow readiness gates", () => {
  it("uses a Node runtime compatible with current Cloudflare dependencies", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/cd.yml",
      ".github/workflows/readiness-scan.yml",
      ".github/workflows/acquisition-readiness-scan.yml",
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
});
