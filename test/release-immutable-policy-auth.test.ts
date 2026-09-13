import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function stepBlock(workflow: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? undefined : next);
}

function unreleasedSection(changelog: string): string {
  const start = changelog.indexOf("## Unreleased");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = changelog.indexOf("\n## ", start + "## Unreleased".length);
  return changelog.slice(start, next === -1 ? undefined : next);
}

describe("immutable-release policy authorization", () => {
  it("isolates administration-read policy proof from tag and publication authority", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const mint = stepBlock(workflow, "Mint immutable-release policy auditor token");
    const policy = stepBlock(workflow, "Require immutable-release enforcement");
    const releaseAbsence = stepBlock(workflow, "Require exact tag and absent prior release");
    const publication = stepBlock(workflow, "Publish the complete immutable buyer asset set");

    expect(mint).toContain(
      "uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0",
    );
    expect(mint).toContain("id: release_policy_auditor");
    expect(mint).toContain("client-id: ${{ vars.NOEMA_RELEASE_AUDITOR_APP_CLIENT_ID }}");
    expect(mint).toContain("private-key: ${{ secrets.NOEMA_RELEASE_AUDITOR_APP_PRIVATE_KEY }}");
    expect(mint).toContain("owner: ContextualWisdomLab");
    expect(mint).toContain("repositories: noema");
    const requestedPermissions = mint
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("permission-"));
    expect(requestedPermissions).toEqual([
      "permission-administration: read",
      "permission-metadata: read",
    ]);

    expect(policy).toContain(
      "DELEGATED_RELEASE_POLICY_AUDITOR_TOKEN: ${{ steps.release_policy_auditor.outputs.token }}",
    );
    expect(policy).toContain("umask 077");
    expect(policy).toContain("mktemp -d");
    expect(policy).toContain('chmod 0600 "$token_path"');
    expect(policy).toContain("unset DELEGATED_RELEASE_POLICY_AUDITOR_TOKEN");
    expect(policy).toContain("NOEMA_RELEASE_AUDITOR_TOKEN_PATH");
    expect(policy).toContain("delegated-github-token.mjs");
    expect(policy).toContain("readDelegatedGithubToken");
    expect(policy).toContain('GH_HOST: "github.com"');
    expect(policy).toContain("maxBuffer: 16 * 1024");
    expect(policy).toContain("timeout: 20_000");
    expect(policy).toContain("repos/${GITHUB_REPOSITORY}/immutable-releases");
    expect(policy).not.toContain("GH_TOKEN: ${{ steps.release_policy_auditor.outputs.token }}");
    expect(policy).not.toContain("releases/tags/${RELEASE_TAG}");

    expect(workflow).toContain(
      "install -m 0644 scripts/lib/delegated-github-token.mjs delegated-github-token.mjs",
    );
    expect(workflow).toContain("release-publication-receipt.mjs \\\n            delegated-github-token.mjs \\\n            verification-handoff.json");
    expect(workflow).toContain("release-publication-receipt.mjs \\\n            delegated-github-token.mjs \\\n            >release-bundle.sha256");

    expect(releaseAbsence).toContain("GH_TOKEN: ${{ github.token }}");
    expect(releaseAbsence).toContain("repos/${GITHUB_REPOSITORY}/commits/${RELEASE_TAG}");
    expect(releaseAbsence).toContain("repos/${GITHUB_REPOSITORY}/releases/tags/${RELEASE_TAG}");
    expect(releaseAbsence).not.toContain("release_policy_auditor");
    expect(releaseAbsence).not.toContain("immutable-releases");

    expect(publication).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publication).not.toContain("steps.release_policy_auditor.outputs.token");
  });

  it("records the release-policy auditor boundary in the Unreleased changelog", () => {
    const changelog = unreleasedSection(readFileSync("CHANGELOG.md", "utf8"));
    expect(changelog).toContain("Release Policy Auditor");
    expect(changelog).toContain("Administration: read");
    expect(changelog).toContain("capability file");
    expect(changelog).toContain("PR #706");
  });

  it("documents the App identifier as an Actions variable and the private key as a secret", () => {
    const guide = readFileSync("docs/immutable-release-publication.md", "utf8");
    expect(guide).toContain(
      "repository Actions variable `NOEMA_RELEASE_AUDITOR_APP_CLIENT_ID`",
    );
    expect(guide).toContain(
      "repository Actions secret `NOEMA_RELEASE_AUDITOR_APP_PRIVATE_KEY`",
    );
    expect(guide).not.toContain("Configure these repository Actions values for that App");
  });

  it("keeps the product gap baseline current with the protected release-policy integration", () => {
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");
    expect(baseline).toContain("Release Policy Auditor");
    expect(baseline).toContain("NOEMA_RELEASE_AUDITOR_APP_CLIENT_ID");
    expect(baseline).toContain("NOEMA_RELEASE_AUDITOR_APP_PRIVATE_KEY");
    expect(baseline).toContain("does not prove App installation");
    expect(baseline).toContain(
      "## Protected immutable-release policy authorization — merged PR #706",
    );
    expect(baseline).toContain(
      "Protected #706 exact `7092432ef8305995e7f9af3398daa675d03bc445`, integrated by GitHub-verified normal merge `0c78c62cf7d63795a5cd847973f4c7a74150ecee`",
    );
    expect(baseline).not.toContain(
      "## Active immutable-release policy audit prerequisite — PR #706",
    );
  });

  it("does not rewrite unrelated historical changelog authority", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    expect(changelog).toContain(
      "private Durable Object request(256-byte)와 decision response(4,096-byte) bounded reader",
    );
    expect(changelog).toContain(
      "quarantine/security authority, release/deployment authority, and foreign-domain truth remain with their existing owners; this protected source is not an immutable release or deployed recovery/p95/heap evidence. PR #687.",
    );
    expect(changelog).toContain(
      "patched `7.29.0`으로 override하고 lockfile을 재생성했다. `npm audit --audit-level=high`가 0건으로 복구하고 release gate가 취약 버전에서 실패-폐쇄하도록 유지한다.",
    );
  });
});
