import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const CHANGELOG_704_MARKER = "- Protected #704 ";
const BASELINE_704_HEADING =
  "## Protected procedural current-lifecycle media admission — merged PR #704";

const REQUIRED_704_CHANGELOG_FRAGMENTS = [
  "Protected #704",
  "42b15e865bdf88fde622c3bba2c0b123770d18be",
  "e8c2002e5af8fa5611880091dab81916bb716c35",
  "application/json with optional `charset=utf-8` parameter",
  "invalid_workflow_state_response",
  "best-effort cleanup",
] as const;

const REQUIRED_704_BASELINE_FRAGMENTS = [
  "merged PR #704 exact `42b15e865bdf88fde622c3bba2c0b123770d18be`",
  "GitHub-verified normal merge `e8c2002e5af8fa5611880091dab81916bb716c35`",
  "application/json with optional `charset=utf-8` parameter",
  "stable `invalid_workflow_state_response`",
  "best-effort cleanup",
  "immutable release",
] as const;

function extractChangelog704Entry(changelog: string): string {
  const start = changelog.indexOf(CHANGELOG_704_MARKER);
  if (start < 0) {
    return "";
  }
  const nextEntry = changelog.indexOf("\n- ", start + CHANGELOG_704_MARKER.length);
  return changelog.slice(start, nextEntry < 0 ? changelog.length : nextEntry);
}

function extractBaseline704Section(baseline: string): string {
  const start = baseline.indexOf(BASELINE_704_HEADING);
  if (start < 0) {
    return "";
  }
  const nextSection = baseline.indexOf("\n## ", start + BASELINE_704_HEADING.length);
  return baseline.slice(start, nextSection < 0 ? baseline.length : nextSection);
}

function hasProtected704ChangelogAuthority(changelog: string): boolean {
  const entry = extractChangelog704Entry(changelog);
  return REQUIRED_704_CHANGELOG_FRAGMENTS.every((fragment) => entry.includes(fragment));
}

function hasProtected704BaselineAuthority(baseline: string): boolean {
  const section = extractBaseline704Section(baseline);
  return REQUIRED_704_BASELINE_FRAGMENTS.every((fragment) => section.includes(fragment));
}

describe("protected procedural current-lifecycle media documentation authority", () => {
  it("rejects authority fragments that are only present in neighboring documentation", () => {
    const relocatedChangelogAuthority = [
      "- Protected #704 exact `42b15e865bdf88fde622c3bba2c0b123770d18be`.",
      "- Protected #702 exact `2b31805eb2b81b6078fefe1ebcce8007b6ca5169`, integrated by GitHub-verified normal merge `e8c2002e5af8fa5611880091dab81916bb716c35`, requires application/json with optional `charset=utf-8` parameter and preserves invalid_workflow_state_response with best-effort cleanup.",
    ].join("\n");
    const relocatedBaselineAuthority = [
      `${BASELINE_704_HEADING}\n\nProtected history includes merged PR #704 exact \`42b15e865bdf88fde622c3bba2c0b123770d18be\`.`,
      "## Protected neighboring authority",
      "GitHub-verified normal merge `e8c2002e5af8fa5611880091dab81916bb716c35` uses application/json with optional `charset=utf-8` parameter, stable `invalid_workflow_state_response`, best-effort cleanup, and remains separate from immutable release evidence.",
    ].join("\n\n");

    expect(hasProtected704ChangelogAuthority(relocatedChangelogAuthority)).toBe(false);
    expect(hasProtected704BaselineAuthority(relocatedBaselineAuthority)).toBe(false);
  });

  it("records protected #704 without promoting Workflow / Task or production authority", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const source = readFileSync("src/agent-runtime/procedural-current-lifecycle.ts", "utf8");
    const changelog704 = extractChangelog704Entry(changelog);
    const baseline704 = extractBaseline704Section(baseline);

    expect(changelog704).not.toBe("");
    for (const fragment of REQUIRED_704_CHANGELOG_FRAGMENTS) {
      expect(changelog704).toContain(fragment);
    }

    expect(baseline704).not.toBe("");
    for (const fragment of REQUIRED_704_BASELINE_FRAGMENTS) {
      expect(baseline704).toContain(fragment);
    }
    expect(baseline704).not.toContain("#704 transfers Workflow / Task lifecycle authority to Agent Runtime");

    expect(source).toContain("function isJsonMediaType(value: string | null): boolean");
    expect(source).toContain("Noema current workflow-state response used an unsupported media type");
  });
});
