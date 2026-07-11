import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("deployment workflow readiness gates", () => {
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

  it("uses Node 22 for Cloudflare tooling in all GitHub workflows", () => {
    const workflows = [
      ".github/workflows/ci.yml",
      ".github/workflows/cd.yml",
      ".github/workflows/readiness-scan.yml",
      ".github/workflows/acquisition-readiness-scan.yml",
    ].map((path) => readFileSync(path, "utf8"));

    workflows.forEach((workflow) => {
      expect(workflow).toContain('node-version: "22"');
      expect(workflow).not.toContain('node-version: "20"');
    });
  });
});
