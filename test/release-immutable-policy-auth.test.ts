import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function stepBlock(workflow: string, name: string): string {
  const marker = `      - name: ${name}`;
  const start = workflow.indexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = workflow.indexOf("\n      - name:", start + marker.length);
  return workflow.slice(start, next === -1 ? undefined : next);
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
    expect(mint).toContain("permission-administration: read");
    expect(mint).toContain("permission-metadata: read");
    expect(mint).not.toContain("permission-administration: write");
    expect(mint).not.toContain("permission-contents:");
    expect(mint).not.toContain("permission-actions:");
    expect(mint).not.toContain("permission-pull-requests:");

    expect(policy).toContain("GH_TOKEN: ${{ steps.release_policy_auditor.outputs.token }}");
    expect(policy).toContain("repos/${GITHUB_REPOSITORY}/immutable-releases");
    expect(policy).not.toContain("GH_TOKEN: ${{ github.token }}");
    expect(policy).not.toContain("releases/tags/${RELEASE_TAG}");

    expect(releaseAbsence).toContain("GH_TOKEN: ${{ github.token }}");
    expect(releaseAbsence).toContain("repos/${GITHUB_REPOSITORY}/commits/${RELEASE_TAG}");
    expect(releaseAbsence).toContain("repos/${GITHUB_REPOSITORY}/releases/tags/${RELEASE_TAG}");
    expect(releaseAbsence).not.toContain("release_policy_auditor");
    expect(releaseAbsence).not.toContain("immutable-releases");

    expect(publication).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publication).not.toContain("steps.release_policy_auditor.outputs.token");
  });
});
