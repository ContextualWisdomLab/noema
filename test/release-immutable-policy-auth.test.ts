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
  it("uses a dedicated repository-scoped administration-read App token for the policy read", () => {
    const workflow = readFileSync(".github/workflows/release-evidence.yml", "utf8");
    const mint = stepBlock(workflow, "Mint immutable-release policy auditor token");
    const policy = stepBlock(workflow, "Require immutable-release enforcement and absent prior release");
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
    expect(policy).not.toContain("GH_TOKEN: ${{ github.token }}");
    expect(publication).toContain("GH_TOKEN: ${{ github.token }}");
    expect(publication).not.toContain("steps.release_policy_auditor.outputs.token");
  });
});
