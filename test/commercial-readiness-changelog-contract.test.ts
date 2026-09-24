import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const CHANGELOG_PATH = "CHANGELOG.md";

/** Isolate the active Unreleased section so historical entries cannot satisfy the current change contract. */
function unreleasedSection(markdown: string): string {
  const heading = "## Unreleased";
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex < 0) {
    throw new Error("CHANGELOG.md is missing the ## Unreleased section.");
  }
  const contentStart = headingIndex + heading.length;
  const nextHeading = markdown.indexOf("\n## ", contentStart);
  return markdown.slice(contentStart, nextHeading < 0 ? markdown.length : nextHeading);
}

describe("commercial readiness changelog contract", () => {
  it("records the authority-bearing #730 behavior changes in Unreleased", () => {
    const changelog = readFileSync(CHANGELOG_PATH, "utf8");
    const unreleased = unreleasedSection(changelog);

    expect(unreleased).toContain("PR #730");
    expect(unreleased).toContain("normal merge");
    expect(unreleased).toContain("target PR/head/base");
    expect(unreleased).toContain("GitHub Actions App id `15368`");
    expect(unreleased).toContain("required-workflow");
    expect(unreleased).toContain("review `commit_id`");
    expect(unreleased).toContain("Noema review marker");
    expect(unreleased).toContain("retry chronology");
  });
});
