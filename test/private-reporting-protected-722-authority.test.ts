import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWED_SOURCE = "b4563512dce9ce9084548cad29f247911949c359";
const PROTECTED_MERGE = "227e746662d29dcc8fe360f055b7fdb7857c09fd";
const FAILED_PROTECTED_SOURCE = "f38962869307a45b3b6e65692b2acbabb075e0eb";
const NO_AUTHORITY_PROMOTION =
  "The #722 merge also grants no repository Administration authority, immutable release or deployment authority, external reporter visibility evidence, staffing evidence, notification evidence, or private-case handling evidence; those remain separate control and evidence classes.";

const AUTHORITY_CLASS =
  /\b(?:repository\s+Administration\s+authority|current\s+(?:operational\s+)?setting(?:\s+state|\s+authority)?|immutable\s+release(?:\s+authority|\s+evidence)?|deployment(?:\s+authority|\s+evidence)?|external\s+reporter\s+visibility(?:\s+evidence)?|staffing(?:\s+coverage|\s+evidence|\s+authority)?|notification(?:\s+evidence|\s+authority)?|private-case\s+handling(?:\s+evidence|\s+authority)?)\b/i;
const DIRECT_AUTHORITY_NEGATION =
  /^(?:(?:because|although|though|while|since)\s+)?no\b|\b(?:does|do|did|is|are|was|were|can|cannot|can't|will|would|shall|should|could)\s+not\b|\b(?:grant|grants|confer|confers|provide|provides|establish|establishes|create|creates|authorize|authorizes|constitute|constitutes|prove|proves|satisfy|satisfies|restore|restores|become|becomes|serve|serves|demonstrate|demonstrates|confirm|confirms|validate|validates|show|shows|indicate|indicates|attest|attests|certify|certifies)\s+no\b/i;
const FUTURE_AUTHORITY_GATE =
  /\b(?:(?:is|are|remains?|remain)\s+(?:pending|unavailable|unrestored|unestablished|unauthorized)\b|only\s+after\b|(?:required|requires?|must)\b[^.!?;]*\bbefore\b)/i;
const EXPLICIT_SEPARATE_CLASSIFICATION =
  /\b(?:is|are|remains?|remain)\s+(?:an?\s+)?(?:separate|independent)\b[^.!?;]*\b(?:control|evidence|authority)(?:\s+class(?:es)?)?\b/i;

function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

function authorityClauses(text: string): string[] {
  return text
    .replace(/[`*_]/g, " ")
    .split(
      /(?<=[.!?;:])\s+|;\s*|,\s*(?=(?:but|yet|whereas|and|because|although|though|since|while|this\s+merge|the\s+merge|#722\s+merge)\b)|\s+[—–]\s+|\s+(?=(?:but|yet|whereas|and|because|although|though|since|while)\b)/iu,
    )
    .map((clause) => clause.trim())
    .filter(Boolean);
}

function hasForbiddenAuthorityPromotion(text: string): boolean {
  return authorityClauses(text).some((clause) => {
    if (!AUTHORITY_CLASS.test(clause)) {
      return false;
    }

    const isExplicitBoundary =
      DIRECT_AUTHORITY_NEGATION.test(clause) ||
      FUTURE_AUTHORITY_GATE.test(clause) ||
      EXPLICIT_SEPARATE_CLASSIFICATION.test(clause);

    return !isExplicitBoundary;
  });
}

function expectNoAuthorityPromotion(section: string): void {
  expect(hasForbiddenAuthorityPromotion(section)).toBe(false);
}

describe("protected #722 private-reporting documentation authority", () => {
  it("records the authenticated read repair without promoting source integration to another authority class", () => {
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

    const integrationSection = markdownSection(
      runbook,
      "2026-09-18 protected integration authority",
    );
    expect(integrationSection).toContain(NO_AUTHORITY_PROMOTION);
    expect(integrationSection).toContain(
      "This merge proves protected source integration of the authenticated collection path.",
    );
    expect(integrationSection).toContain(
      "those remain separate control and evidence classes",
    );
    expectNoAuthorityPromotion(integrationSection);

    expect(doctoring).toContain("Status: Protected source integration record; operational setting evidence remains pending.");
    expect(doctoring).toContain("Source integration, setting observation, external reporter visibility, staffing, private-case exercise, immutable release, deployment and acquisition evidence remain separate authority classes.");
    expect(doctoring).toContain("No PAT");
    expect(doctoring).toContain("GitHub-verified normal merge");
    expect(doctoring).toContain("must return PASS before current operational setting authority is restored");
  });

  it("rejects unqualified authority assertions regardless of promotion predicate", () => {
    const forbidden = [
      "This merge establishes deployment authority.",
      "This merge is deployment authority.",
      "This merge demonstrates deployment authority.",
      "This merge confirms deployment authority.",
      "This merge validates deployment authority.",
      "This merge shows deployment authority.",
      "Deployment authority follows from this merge.",
      "The protected integration provides current operational setting authority.",
      "The #722 merge confers repository Administration authority.",
      "The merge proves external reporter visibility evidence.",
      "The merge satisfies staffing evidence.",
      "The merge serves private-case handling evidence.",
      "No external reporter visibility evidence exists, but this merge establishes deployment authority.",
      "Staffing remains pending, yet this merge provides current setting authority.",
      "Although no external reporter visibility evidence exists, this merge establishes deployment authority.",
      "No external reporter visibility evidence exists: this merge establishes deployment authority.",
      "No staffing evidence exists; this merge establishes deployment authority.",
      "No staffing evidence exists and this merge provides current setting authority.",
      "This merge establishes deployment authority without release evidence.",
      "This merge establishes deployment authority with no staffing evidence.",
      "This merge establishes deployment authority until a later release.",
      "This merge establishes deployment authority after review.",
    ];

    const allowed = [
      "The #722 merge does not establish current setting state.",
      "This merge provides no deployment evidence.",
      "Deployment authority remains pending until a fresh protected-main PASS.",
      "Deployment authority is a separate control and evidence class.",
      "This merge is protected source integration because deployment authority is a separate control and evidence class.",
      "A fresh protected-main PASS is required before current setting authority is restored.",
      "Current setting authority is restored only after a fresh protected-main PASS.",
      "The #722 merge grants no repository Administration authority, immutable release or deployment authority.",
      "The #722 merge grants no repository Administration authority and does not provide deployment evidence.",
      "No external reporter visibility evidence exists.",
      "Current setting authority remains unavailable until a fresh protected-main PASS.",
    ];

    for (const statement of forbidden) {
      expect(hasForbiddenAuthorityPromotion(statement), statement).toBe(true);
    }
    for (const statement of allowed) {
      expect(hasForbiddenAuthorityPromotion(statement), statement).toBe(false);
    }
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
