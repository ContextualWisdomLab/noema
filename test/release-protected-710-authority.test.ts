import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const protectedSourceExact = "8bc768756a10bab1d32b14039cdcfdb48d001931";
const protectedMergeExact = "de0f3b5a9b5040ce4700a0888539f3d4f1d723bc";

function section(document: string, heading: string): string {
  const start = document.indexOf(heading);
  if (start < 0) return "";
  const rest = document.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? document.slice(start) : document.slice(start, start + heading.length + next);
}

function listItem(document: string, prefix: string): string {
  return document
    .split("\n")
    .find((line) => line.startsWith(prefix)) ?? "";
}

describe("protected #710 release source authority", () => {
  it("converges protected #710 into changelog and product-gap authority", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const heading = "## Protected exact-main release admission — merged PR #710";
    const changelogAuthority = listItem(section(changelog, "## Unreleased"), "- Protected #710 ");
    const authority = section(baseline, heading);

    for (const document of [changelogAuthority, authority]) {
      expect(document).toContain("Protected #710");
      expect(document).toContain(protectedSourceExact);
      expect(document).toContain(protectedMergeExact);
      expect(document).toContain("freshly resolved current protected `main`");
      expect(document).toContain("canonical `origin`");
      expect(document).toContain("`refs/heads/main`");
      expect(document).toContain("non-shell `git ls-remote --refs`");
      expect(document).toContain("20-second timeout");
      expect(document).toContain("16 KiB output ceiling");
      expect(document).toContain("exactly one canonical lowercase full SHA");
      expect(document).toContain("Repository substitution");
      expect(document).toContain("malformed or ambiguous ref output");
      expect(document).toContain("noncanonical SHA identity");
      expect(document).toContain("network-independent");
      expect(document).toContain("fail closed");
      expect(document).toContain("does not prove");
    }
  });
});
