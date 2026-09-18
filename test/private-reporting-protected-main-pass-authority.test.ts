import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const PROTECTED_SOURCE = "227e746662d29dcc8fe360f055b7fdb7857c09fd";
const RUN_ID = "35319167109";
const JOB_ID = "105517517587";
const ARTIFACT_ID = "10547590954";
const ARTIFACT_DIGEST =
  "sha256:5538ae29cc4f5032a8aca79c23064b72fa1d879fba32a92fbb462f0bf601a152";
const GENERATED_AT = "2026-09-18T12:45:48.831Z";

/** Isolates the dated operational-PASS section so later evidence classes cannot satisfy its assertions accidentally. */
function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

describe("protected-main private-reporting PASS authority", () => {
  it("binds the restored setting authority to the executed protected source and retained receipt", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const section = markdownSection(
      runbook,
      "2026-09-18 protected operational PASS authority",
    );

    for (const evidence of [
      PROTECTED_SOURCE,
      RUN_ID,
      JOB_ID,
      ARTIFACT_ID,
      ARTIFACT_DIGEST,
      GENERATED_AT,
      "status: PASS",
      "enabled: true",
      "runner `1002028719`",
    ]) {
      expect(section).toContain(evidence);
    }

    expect(section).toContain(
      "Run #31 therefore restores current operational setting authority for that protected-source observation",
    );
    expect(section).toContain(
      "run #30 remains retained historical RED for the former source rather than being rewritten or discarded",
    );
  });

  it("keeps the setting receipt separate from unexecuted operational and commercial authority", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const section = markdownSection(
      runbook,
      "2026-09-18 protected operational PASS authority",
    );

    for (const boundary of [
      "does not establish external reporter visibility evidence",
      "staffing evidence",
      "notification evidence",
      "private-case handling evidence",
      "immutable release authority",
      "deployment authority",
      "production KPI evidence",
      "acquisition evidence",
      "stale-receipt/freshness policy",
    ]) {
      expect(section).toContain(boundary);
    }
  });

  it("keeps doctoring traceability exact and does not erase the failure lineage", () => {
    const doctoring = readFileSync(
      "docs/doctoring/private_vulnerability_reporting_authenticated_read.md",
      "utf8",
    );

    for (const evidence of [
      PROTECTED_SOURCE,
      RUN_ID,
      JOB_ID,
      ARTIFACT_ID,
      ARTIFACT_DIGEST,
      GENERATED_AT,
      "status: PASS",
      "enabled: true",
      "Run #30 (`35195461128`) is the newer retained failure",
      "stale-receipt policy remains open in issue #73",
    ]) {
      expect(doctoring).toContain(evidence);
    }
  });
});
