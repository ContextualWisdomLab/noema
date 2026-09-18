import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STATE_SUBJECT_SOURCE =
  String.raw`(?:the\s+)?(?:live\s+(?:private-vulnerability-reporting\s+)?setting|private\s+vulnerability\s+reporting(?:\s+setting)?)`;
const POSITIVE_SETTING_STATE = new RegExp(
  String.raw`\b${STATE_SUBJECT_SOURCE}\b[^.!?;]{0,120}\b(?:is|remains?|was|were|becomes?|became|as|to\s+be)\s+(?:currently\s+)?(?:enabled|disabled)\b`,
  "i",
);
const DIRECT_NEGATION =
  /\b(?:does|do|did|is|are|was|were|can|cannot|can't|will|would|shall|should|could)\s+not\b|\b(?:prove|proves|confirm|confirms|demonstrate|demonstrates|show|shows|establish|establishes|indicate|indicates)\s+no\b/i;
const STATE_CLAUSE_BOUNDARY =
  /(?<=[.!?;:])\s+|;\s*|,\s*(?=(?:but|yet|and|or|therefore|thus|hence|consequently)\b)|\s+(?=(?:but|yet|whereas|because|although|though|since|while|therefore|thus|hence|consequently)\b)/iu;

function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

function hasForbiddenCurrentSettingClaim(text: string): boolean {
  return text
    .replace(/[`*_]/g, " ")
    .split(STATE_CLAUSE_BOUNDARY)
    .map((clause) => clause.trim())
    .filter(Boolean)
    .some(
      (clause) =>
        POSITIVE_SETTING_STATE.test(clause) && !DIRECT_NEGATION.test(clause),
    );
}

describe("protected #722 current private-reporting setting authority", () => {
  it("keeps protected source integration from claiming the live setting state", () => {
    const runbook = readFileSync(
      "docs/security/private-vulnerability-reporting-audit.md",
      "utf8",
    );
    const integrationSection = markdownSection(
      runbook,
      "2026-09-18 protected integration authority",
    );

    expect(hasForbiddenCurrentSettingClaim(integrationSection)).toBe(false);
  });

  it("rejects direct enabled/disabled setting-state promotion while preserving explicit negation", () => {
    const forbidden = [
      "This merge proves the live setting is currently enabled.",
      "This merge confirms private vulnerability reporting is enabled.",
      "Protected integration demonstrates the private vulnerability reporting setting remains enabled.",
      "The merge establishes the private vulnerability reporting setting as enabled.",
      "Source integration shows private vulnerability reporting to be enabled.",
      "This merge does not prove deployment authority, but private vulnerability reporting is enabled.",
    ];
    const allowed = [
      "This merge does not prove the live setting is currently enabled.",
      "This merge does not establish that private vulnerability reporting is enabled.",
      "The protected merge is source integration only; the live setting state requires a fresh protected-main PASS.",
      "GitHub documents the private vulnerability reporting status endpoint separately from mutation authority.",
    ];

    for (const statement of forbidden) {
      expect(hasForbiddenCurrentSettingClaim(statement), statement).toBe(true);
    }
    for (const statement of allowed) {
      expect(hasForbiddenCurrentSettingClaim(statement), statement).toBe(false);
    }
  });
});