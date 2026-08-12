import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readRequiredFile(path: string): string {
  expect(existsSync(path), `${path} must exist`).toBe(true);
  return readFileSync(path, "utf8");
}

function readUnreleasedSection(changelog: string): string {
  const unreleasedStart = changelog.indexOf("## Unreleased");
  expect(unreleasedStart, "CHANGELOG.md must contain ## Unreleased").toBeGreaterThanOrEqual(0);
  const nextHeading = changelog.indexOf("\n## ", unreleasedStart + "## Unreleased".length);
  return changelog.slice(
    unreleasedStart,
    nextHeading === -1 ? changelog.length : nextHeading,
  );
}

describe("coordinated vulnerability disclosure contract", () => {
  it("publishes a private, scoped, and non-contractual reporting policy", () => {
    const policy = readRequiredFile("SECURITY.md");

    expect(policy).toContain("# Security Policy");
    expect(policy).toContain("## Supported versions");
    expect(policy).toContain("pre-release");
    expect(policy).toContain("Report a vulnerability");
    expect(policy).toContain("when that control is available");
    expect(policy).toContain(
      "Do not include vulnerability details in a public issue",
    );
    expect(policy).toContain("## What to include");
    expect(policy).toContain("exact commit, release, or deployed version");
    expect(policy).toContain("reproduction steps");
    expect(policy).toContain("## Authorized research and safe harbor");
    expect(policy).toContain("good-faith security research");
    expect(policy).toContain("stop immediately");
    expect(policy).toContain("denial of service");
    expect(policy).toContain("social engineering");
    expect(policy).toContain("## Response objectives");
    expect(policy).toContain("service objectives, not contractual SLAs");
    expect(policy).toContain("CVSS v4.0");
    expect(policy).toContain("known exploitation");
    expect(policy).toContain("## Coordinated disclosure");
    expect(policy).toContain("no public bug bounty");
  });

  it("defines an evidence-preserving vulnerability handling lifecycle", () => {
    const handling = readRequiredFile(
      "docs/security/vulnerability-handling.md",
    );

    for (const required of [
      "## Roles and separation of duties",
      "## Intake and acknowledgement",
      "## Validation and severity",
      "## Containment and remediation",
      "## Advisory, release, and disclosure",
      "## Recovery and lessons learned",
      "## Evidence record",
      "NIST SP 800-61 Rev. 3",
      "ISO/IEC 29147:2018",
      "ISO/IEC 30111:2019",
      "CVSS v4.0",
      "CISA Known Exploited Vulnerabilities",
    ]) {
      expect(handling).toContain(required);
    }

    expect(handling).toContain("independent reviewer");
    expect(handling).toContain("exact affected source revision");
    expect(handling).toContain("immutable release identity");
    expect(handling).toContain("private advisory");
    expect(handling).toContain("root-cause");
    expect(handling).toContain("no vulnerability details in public CI logs");
  });

  it("connects the content-free public fallback to a private case", () => {
    const handling = readRequiredFile(
      "docs/security/vulnerability-handling.md",
    );

    expect(handling).toContain("`Private security contact requested`");
    expect(handling).toContain("assign an owner");
    expect(handling).toContain("approved private channel");
    expect(handling).toContain("request no vulnerability details in that public issue");
    expect(handling).toContain("move the report into a private case");
    expect(handling).toContain("published service objective");
  });

  it("bounds security evidence retention and sensitive-data disposal", () => {
    const handling = readRequiredFile(
      "docs/security/vulnerability-handling.md",
    );

    for (const required of [
      "Reporter contact, attribution preference, and necessary PII",
      "Secrets, credentials, tokens, and session material",
      "Exploit payloads, attachments, and reproduction evidence",
      "Audit and decision metadata",
      "18 months",
      "30 days",
      "24 months",
      "7 years",
      "Security Case Owner",
      "quarterly",
      "legal hold",
      "role-based access",
      "secure deletion or redaction",
      "UTC timestamp",
    ]) {
      expect(handling).toContain(required);
    }
  });

  it("records current primary standards and product-specific rationale", () => {
    const doctoring = readRequiredFile(
      "docs/doctoring/vulnerability-disclosure.md",
    );
    const changelog = readRequiredFile("CHANGELOG.md");
    const unreleased = readUnreleasedSection(changelog);

    expect(doctoring).toContain("# Vulnerability disclosure and handling");
    expect(doctoring).toContain("ISO/IEC 29147:2018");
    expect(doctoring).toContain("ISO/IEC 30111:2019");
    expect(doctoring).toContain("ISO/IEC AWI 29147");
    expect(doctoring).toContain("ISO/IEC WD 30111.2");
    expect(doctoring).toContain("NIST SP 800-61 Rev. 3");
    expect(doctoring).toContain("Common Vulnerability Scoring System Version 4.0");
    expect(doctoring).toContain("APA 7th references");
    expect(doctoring).toContain("retention periods are Noema operational defaults");
    expect(doctoring).toContain(
      "does not prove that GitHub private vulnerability reporting is enabled",
    );
    expect(doctoring).toContain("notification subscriptions are staffed");
    expect(doctoring).toContain(
      "a private-advisory response objective has been met",
    );
    expect(unreleased).toContain("coordinated vulnerability disclosure");
  });
});
