import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doctoringPath = "docs/doctoring/package-manager-reproducibility.md";
const changelogPath = "CHANGELOG.md";

function markdownSection(document: string, heading: string): string {
  const marker = `## ${heading}\n`;
  const start = document.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = start + marker.length;
  const next = document.indexOf("\n## ", bodyStart);
  return document.slice(bodyStart, next === -1 ? document.length : next);
}

describe("package-manager reproducibility doctoring", () => {
  it("documents the reviewed toolchain and install-script authority in their exact sections", () => {
    expect(existsSync(doctoringPath)).toBe(true);
    const document = readFileSync(doctoringPath, "utf8");
    const decision = markdownSection(document, "결정");
    const installScripts = markdownSection(document, "Install-script 실행 권한");

    expect(decision).toContain("Node.js 24.19.0");
    expect(decision).toContain("npm 11.17.0");
    expect(decision).toContain("`.github/workflows/ci.yml`");

    expect(installScripts).toContain("`strict-allow-scripts=true`");
    expect(installScripts).toContain("`esbuild@0.28.1`은 실행을 허용");
    expect(installScripts).toContain("`workerd@1.20260625.1`도 실행을 허용");
    expect(installScripts).toContain("`fsevents@2.3.3`은 명시적 `false`로 거부");
  });

  it("documents schema v3 lockfile evidence and authority separation under the correct sections", () => {
    const document = readFileSync(doctoringPath, "utf8");
    const lockfileControl = markdownSection(document, "Live base와 lockfile change control");
    const evidenceAuthority = markdownSection(document, "증거 권한 분리");
    const regeneration = markdownSection(document, "재생성·검증 절차");

    for (const phrase of [
      "schemaVersion 3",
      "exact base SHA",
      "before/after",
      "topLevelMetadataDigests",
      "bulkChange",
      "duplicate",
    ]) {
      expect(document).toContain(phrase);
    }
    expect(lockfileControl).toContain("**schemaVersion 3** closed contract");
    expect(lockfileControl).toContain("exact base SHA");
    expect(lockfileControl).toContain("before/after");
    expect(lockfileControl).toContain("`topLevelMetadataDigests`");
    expect(lockfileControl).toContain("`bulkChange`");
    expect(evidenceAuthority).toContain("**not merge authority**");
    expect(regeneration).toContain("npm ci --legacy-peer-deps=false --install-links=false");
  });

  it("records primary technical sources as complete APA-style bibliography entries", () => {
    const document = readFileSync(doctoringPath, "utf8");
    const references = markdownSection(document, "참고문헌 — APA 7");

    for (const entry of [
      "GitHub, Inc. (2026). *actions/checkout releases*. GitHub. https://github.com/actions/checkout/releases",
      "GitHub, Inc. (2026). *actions/setup-node releases*. GitHub. https://github.com/actions/setup-node/releases",
      "npm, Inc. (2026). *npm ci*. npm Docs. https://docs.npmjs.com/cli/v11/commands/npm-ci/",
      "npm, Inc. (2026). *package.json*. npm Docs. https://docs.npmjs.com/files/package.json",
    ]) {
      expect(references).toContain(entry);
    }
  });

  it("records the integrated package-manager control under the exact Unreleased heading", () => {
    expect(existsSync(changelogPath)).toBe(true);
    const changelog = readFileSync(changelogPath, "utf8");
    expect(changelog).toMatch(/^## Unreleased$/m);
    const unreleased = markdownSection(changelog, "Unreleased");

    expect(unreleased).toContain("Node.js 24.19.0/npm 11.17.0");
    expect(unreleased).toContain("strict-allow-scripts=true");
    expect(unreleased).toContain("schema v3");
  });
});
