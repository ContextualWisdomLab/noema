import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const protectedSourceExact = "8e4a35c28418fa3049e1dc13470088e8dacf2306";
const protectedMergeExact = "2026878cc4627ef2cc781c9aa68da0e11b066fd1";

function section(document: string, heading: string): string {
  const start = document.indexOf(heading);
  if (start < 0) return "";
  const rest = document.slice(start + heading.length);
  const next = rest.search(/\n## /);
  return next < 0 ? document.slice(start) : document.slice(start, start + heading.length + next);
}

describe("protected #708 release authority", () => {
  it("documents all four release jobs instead of the obsolete two-job trust model", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const guide = readFileSync("docs/immutable-release-publication.md", "utf8");
    const trust = section(guide, "## Trust separation");

    for (const job of ["verify_release", "materialize_release", "attest_release", "publish_release"]) {
      expect(workflow).toContain(`  ${job}:`);
      expect(trust).toContain(`### \`${job}\``);
    }
    expect(trust).toContain("four jobs with different authorities");
    expect(trust).not.toContain("two jobs with different authorities");
  });

  it("converges protected #708 into changelog and product-gap authority", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    const heading = "## Protected immutable-release draft publication — merged PR #708";
    const authority = section(baseline, heading);

    for (const document of [changelog, authority]) {
      expect(document).toContain("Protected #708");
      expect(document).toContain(protectedSourceExact);
      expect(document).toContain(protectedMergeExact);
      expect(document).toContain("exactly one total same-tag release");
      expect(document).toContain("numeric release ID");
      expect(document).toContain("does not prove");
    }
  });
});
