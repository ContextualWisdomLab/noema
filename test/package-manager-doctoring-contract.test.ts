import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doctoringPath = "docs/doctoring/package-manager-reproducibility.md";
const changelogPath = "CHANGELOG.md";

describe("package-manager reproducibility doctoring", () => {
  it("documents the reviewed toolchain, install-script, lockfile, and evidence boundaries", () => {
    expect(existsSync(doctoringPath)).toBe(true);
    const document = existsSync(doctoringPath) ? readFileSync(doctoringPath, "utf8") : "";

    for (const phrase of [
      "Node.js 24.19.0",
      "npm 11.17.0",
      "strict-allow-scripts=true",
      "esbuild@0.28.1",
      "workerd@1.20260625.1",
      "fsevents@2.3.3",
      "schemaVersion 2",
      "exact base SHA",
      "before/after",
      "duplicate",
      "npm ci --legacy-peer-deps=false --install-links=false",
      "not merge authority",
    ]) {
      expect(document).toContain(phrase);
    }
  });

  it("records primary technical sources in APA-style references", () => {
    const document = existsSync(doctoringPath) ? readFileSync(doctoringPath, "utf8") : "";

    expect(document).toContain("## 참고문헌 — APA 7");
    expect(document).toContain("https://docs.npmjs.com/cli/v11/commands/npm-ci/");
    expect(document).toContain("https://docs.npmjs.com/files/package.json");
    expect(document).toContain("https://github.com/actions/checkout/releases");
    expect(document).toContain("https://github.com/actions/setup-node/releases");
  });

  it("records the integrated package-manager control under Unreleased", () => {
    expect(existsSync(changelogPath)).toBe(true);
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, "utf8") : "";
    const unreleased = changelog.split(/^## /m).find((section) => section.startsWith("Unreleased")) ?? "";

    expect(unreleased).toContain("Node.js 24.19.0/npm 11.17.0");
    expect(unreleased).toContain("strict-allow-scripts=true");
    expect(unreleased).toContain("schema v2");
  });
});
