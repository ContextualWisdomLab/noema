import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWED_SOURCE = "b4563512dce9ce9084548cad29f247911949c359";
const PROTECTED_MERGE = "227e746662d29dcc8fe360f055b7fdb7857c09fd";
const FAILED_PROTECTED_SOURCE = "f38962869307a45b3b6e65692b2acbabb075e0eb";
const NO_AUTHORITY_PROMOTION =
  "The #722 merge also grants no repository Administration authority, immutable release or deployment authority, external reporter visibility evidence, staffing evidence, notification evidence, or private-case handling evidence; those remain separate control and evidence classes.";

describe("protected #722 private-reporting documentation authority", () => {
  it("records the authenticated read repair without promoting source integration to current setting PASS", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const doctoring = readFileSync(
      "docs/doctoring/private_vulnerability_reporting_authenticated_read.md",
      "utf8",
    );

    for (const document of [runbook, doctoring]) {
      expect(document).toContain(REVIEWED_SOURCE);
      expect(document).toContain(PROTECTED_MERGE);
      expect(document).toContain("Metadata: read");
      expect(document).toContain("Administration: write");
      expect(document).toContain("protected-main");
    }

    expect(runbook).toContain(FAILED_PROTECTED_SOURCE);
    expect(runbook).toContain("run #29 remains dated historical PASS evidence");
    expect(runbook).toContain("run #30 remains the newer fail-closed collection RED");
    expect(runbook).toContain("must still produce a fresh PASS");
    expect(runbook).toContain(
      "does **not** prove the live setting is currently enabled",
    );
    expect(runbook).toContain(NO_AUTHORITY_PROMOTION);
    expect(runbook).not.toContain(
      "protected #722 integration proves private vulnerability reporting is enabled",
    );
    expect(runbook).not.toContain("#722 grants repository Administration authority");
    expect(runbook).not.toContain("#722 grants immutable release authority");
    expect(runbook).not.toContain("#722 grants deployment authority");
    expect(runbook).not.toContain("#722 proves external reporter visibility");
    expect(runbook).not.toContain("#722 proves staffing coverage");
    expect(runbook).not.toContain("#722 proves private-case handling");

    expect(doctoring).toContain("Status: Protected source integration record; operational setting evidence remains pending.");
    expect(doctoring).toContain("Source integration, setting observation, external reporter visibility, staffing, private-case exercise, immutable release, deployment and acquisition evidence remain separate authority classes.");
    expect(doctoring).toContain("No PAT");
    expect(doctoring).toContain("GitHub-verified normal merge");
    expect(doctoring).toContain("must return PASS before current operational setting authority is restored");
    expect(doctoring).not.toContain("current operational setting authority is restored by source integration");
  });

  it("keeps the credential path narrow and makes the operational follow-up explicit", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const workflow = readFileSync(
      ".github/workflows/private-vulnerability-reporting-audit.yml",
      "utf8",
    );

    expect(workflow).toContain("actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1");
    expect(workflow).toContain("permission-metadata: read");
    expect(workflow).toContain("NOEMA_PRIVATE_VULNERABILITY_REPORTING_TOKEN_PATH");
    expect(workflow).not.toContain("permission-administration: write");
    expect(workflow).not.toContain("NOEMA_PRIVATE_VULNERABILITY_REPORTING_TOKEN:");

    expect(runbook).toContain("repository-scoped GitHub App installation token");
    expect(runbook).toContain("a subsequent protected-main scheduled/manual execution must still produce a fresh PASS");
    expect(runbook).toContain("reporter UI visibility, notification routing, staffing, case access, or an end-to-end exercise");
  });
});
