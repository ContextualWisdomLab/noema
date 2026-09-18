import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STATE_SUBJECT_SOURCE =
  String.raw`(?:the\s+)?(?:live\s+(?:private-vulnerability-reporting\s+)?setting|private\s+vulnerability\s+reporting(?:\s+setting)?)`;
const POSITIVE_SETTING_STATE_SOURCE =
  String.raw`\b${STATE_SUBJECT_SOURCE}\b[^.!?;]{0,120}?\b(?:is|remains?|was|were|becomes?|became|as|to\s+be)\s+(?:currently\s+)?(?:enabled|disabled)\b`;
const DIRECT_SETTING_NEGATION_PREFIX = new RegExp(
  String.raw`(?:\b(?:does|do|did|can|will|would|shall|should|could)\s+not\s+(?:prove|confirm|demonstrate|show|establish|indicate)\s+(?:that\s+)?(?:\(\s*|\[\s*)?|\b(?:prove|proves|confirm|confirms|demonstrate|demonstrates|show|shows|establish|establishes|indicate|indicates)\s+no\s+(?:\(\s*|\[\s*)?|\bno\s+)$`,
  "i",
);

/** Extracts one Markdown section so authority checks do not leak across headings. */
function markdownSection(markdown: string, heading: string): string {
  const marker = `## ${heading}`;
  const start = markdown.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);

  const bodyStart = start + marker.length;
  const nextHeading = markdown.indexOf("\n## ", bodyStart);
  return markdown.slice(bodyStart, nextHeading === -1 ? undefined : nextHeading);
}

/** Rejects live setting-state assertions unless that exact proposition is directly negated. */
function hasForbiddenCurrentSettingClaim(text: string): boolean {
  const normalized = text.replace(/[`*_]/g, " ");
  const assertions = normalized.matchAll(
    new RegExp(POSITIVE_SETTING_STATE_SOURCE, "gi"),
  );

  return Array.from(assertions).some((assertion) => {
    const assertionIndex = assertion.index;
    if (assertionIndex === undefined) {
      return true;
    }

    const prefix = normalized.slice(0, assertionIndex);
    return !DIRECT_SETTING_NEGATION_PREFIX.test(prefix);
  });
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

  it("rejects each enabled/disabled setting-state promotion while preserving scoped negation", () => {
    const forbidden = [
      "This merge proves the live setting is currently enabled.",
      "This merge confirms private vulnerability reporting is enabled.",
      "Protected integration demonstrates the private vulnerability reporting setting remains enabled.",
      "The merge establishes the private vulnerability reporting setting as enabled.",
      "Source integration shows private vulnerability reporting to be enabled.",
      "This merge does not prove deployment authority, but private vulnerability reporting is enabled.",
      "This merge does not prove deployment authority, private vulnerability reporting is enabled.",
      "This merge does not prove deployment authority and the live setting is currently enabled.",
      "This merge does not prove deployment authority or private vulnerability reporting is disabled.",
      "This merge does not prove deployment authority (private vulnerability reporting is enabled).",
      "This merge does not prove deployment authority [the live setting is currently enabled].",
      "This merge does not prove the live setting is enabled (private vulnerability reporting is enabled).",
      "This merge does not establish that private vulnerability reporting is enabled [the live setting is enabled].",
    ];
    const allowed = [
      "This merge does not prove the live setting is currently enabled.",
      "This merge does not establish that private vulnerability reporting is enabled.",
      "This merge does not prove (private vulnerability reporting is enabled).",
      "This merge does not establish [the live setting is currently enabled].",
      "No live setting is currently enabled by this source-integration evidence.",
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
