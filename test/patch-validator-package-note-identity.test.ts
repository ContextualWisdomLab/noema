import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(import.meta.dirname, "..");
const dockerfilePath = resolve(repositoryRoot, "Dockerfile.patch-validator");
const publicDocumentationPath = resolve(repositoryRoot, "docs", "patch-validator-image.md");
const changelogPath = resolve(repositoryRoot, "CHANGELOG.md");

describe("patch-validator package note identity", () => {
  it("does not embed a generic package URL in the static Node package note", () => {
    const dockerfile = readFileSync(dockerfilePath, "utf8");

    expect(dockerfile).not.toContain("pkg:generic/");
    expect(dockerfile).toContain(
      '"cpe":"cpe:2.3:a:nodejs:node.js:24.19.0:*:*:*:*:*:*:*"',
    );
  });

  it("documents the retained raw per-component Grype evidence instead of superseded synthetic artifacts", () => {
    const publicDocumentation = readFileSync(publicDocumentationPath, "utf8");
    const changelog = readFileSync(changelogPath, "utf8");
    const unreleasedChangelog = changelog.split("\n## ", 3)[1] ?? "";

    expect(publicDocumentation).not.toContain("status `completed`");
    expect(publicDocumentation).not.toContain("embedded-runtime-sbom.cdx.json");
    expect(publicDocumentation).not.toContain("positive assessment");
    expect(publicDocumentation).toContain("raw per-component Grype");
    expect(unreleasedChangelog).not.toContain("status=completed");
    expect(unreleasedChangelog).toContain("raw per-component Grype");
  });
});
