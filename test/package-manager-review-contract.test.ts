import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const doctoring = readFileSync(
  "docs/doctoring/package-manager-reproducibility.md",
  "utf8",
);
const changelog = readFileSync("CHANGELOG.md", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

function markdownSection(document: string, exactHeading: string) {
  const heading = `${exactHeading}\n`;
  const start = document.indexOf(heading);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = start + heading.length;
  const nextHeading = document.indexOf("\n## ", bodyStart);
  return document.slice(bodyStart, nextHeading === -1 ? document.length : nextHeading);
}

function workflowStep(workflow: string, name: string, nextName: string) {
  const start = workflow.indexOf(`- name: ${name}`);
  const end = workflow.indexOf(`- name: ${nextName}`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return workflow.slice(start, end);
}

describe("package-manager review contracts", () => {
  it("states that immutable JavaScript Action pins in this decision are scoped to ci.yml", () => {
    const decision = markdownSection(doctoring, "## 결정");

    expect(decision).toContain(
      "이 Action source pin 결정의 범위는 `.github/workflows/ci.yml`이다.",
    );
    expect(decision).not.toContain("readiness-scan.yml");
    expect(decision).not.toContain("acquisition-readiness-scan.yml");
  });

  it("binds allow and deny install-script identities inside the policy section", () => {
    const policy = markdownSection(doctoring, "## Install-script 실행 권한");

    expect(policy).toMatch(/`esbuild@0\.28\.1`[^\n]*허용/);
    expect(policy).toMatch(/`workerd@1\.20260625\.1`[^\n]*허용/);
    expect(policy).toMatch(/`fsevents@2\.3\.3`[^\n]*(?:false|deny|거부)/i);
    expect(policy).toContain("실행 권한이 아니다");
  });

  it("keeps lockfile digest evidence in the live-base change-control section", () => {
    const lockfileSection = markdownSection(doctoring, "## Live base와 lockfile change control");

    expect(lockfileSection).toContain("exact base SHA");
    expect(lockfileSection).toContain("before/after");
    expect(lockfileSection).toContain("canonical SHA-256");
    expect(lockfileSection).toContain("schemaVersion 3");
    expect(lockfileSection).toContain("topLevelMetadataDigests");
    expect(lockfileSection).toContain("bulkChange");
  });

  it("uses APA-style corporate-author bibliography entries rather than URL-only evidence", () => {
    const references = markdownSection(doctoring, "## 참고문헌 — APA 7");

    expect(references).toMatch(
      /^GitHub, Inc\. \(2026\)\. \*actions\/checkout releases\*\. GitHub\. https:\/\/github\.com\/actions\/checkout\/releases$/m,
    );
    expect(references).toMatch(
      /^GitHub, Inc\. \(2026\)\. \*actions\/setup-node releases\*\. GitHub\. https:\/\/github\.com\/actions\/setup-node\/releases$/m,
    );
    expect(references).toMatch(
      /^npm, Inc\. \(2026\)\. \*npm ci\*\. npm Docs\. https:\/\/docs\.npmjs\.com\/cli\/v11\/commands\/npm-ci\/$/m,
    );
  });

  it("requires the exact Unreleased heading for package-manager changelog evidence", () => {
    const headings = [...changelog.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings).toContain("Unreleased");
    expect(headings.filter((heading) => heading.startsWith("Unreleased"))).toEqual([
      "Unreleased",
    ]);

    const unreleased = markdownSection(changelog, "## Unreleased");
    expect(unreleased).toContain("Node.js 24.19.0/npm 11.17.0");
    expect(unreleased).toContain("strict-allow-scripts=true");
    expect(unreleased).toContain("schema v3");
  });

  it("validates every declared workflow Node version instead of only the first match", () => {
    for (const path of [
      ".github/workflows/ci.yml",
      ".github/workflows/cd.yml",
      ".github/workflows/readiness-scan.yml",
      ".github/workflows/acquisition-readiness-scan.yml",
      ".github/workflows/hourly-commercial-readiness.yml",
    ]) {
      const workflow = readFileSync(path, "utf8");
      const declaredVersions = [
        ...workflow.matchAll(/node-version:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/g),
      ].map((match) => match[1] ?? match[2] ?? match[3]);

      expect(declaredVersions.length).toBeGreaterThan(0);
      for (const version of declaredVersions) {
        expect(version).toMatch(/^24(?:\.\d+\.\d+)?$/);
      }
    }
  });

  it("keeps the exact live-base SHA guard inside the lockfile git-show step", () => {
    const step = workflowStep(
      ciWorkflow,
      "verify lockfile change control",
      "install",
    );
    const guard = step.indexOf(
      'if [[ ! "$NOEMA_LIVE_BASE_SHA" =~ ^[0-9a-f]{40}$ ]]; then',
    );
    const error = step.indexOf(
      "printf '::error::Invalid live pull-request base SHA.\\n'",
      guard,
    );
    const exit = step.indexOf("exit 1", error);
    const baseRead = step.indexOf(
      'git show "${NOEMA_LIVE_BASE_SHA}:package-lock.json"',
      exit,
    );

    expect(guard).toBeGreaterThanOrEqual(0);
    expect(error).toBeGreaterThan(guard);
    expect(exit).toBeGreaterThan(error);
    expect(baseRead).toBeGreaterThan(exit);
  });
});
