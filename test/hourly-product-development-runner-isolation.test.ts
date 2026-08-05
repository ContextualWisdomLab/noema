import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function workflowText(): string {
  return readFileSync(
    ".github/workflows/hourly-product-development.yml",
    "utf8",
  );
}

function architectureDocument(path: string): string {
  return readFileSync(path, "utf8");
}

describe("hourly product-development runner isolation", () => {
  it("never mints publication credentials on a runner that executed proposed code", () => {
    const workflow = workflowText();
    const verifierIndex = workflow.indexOf("  package_product_increment:");
    const publisherIndex = workflow.indexOf("  publish_product_increment:");

    expect(verifierIndex).toBeGreaterThan(-1);
    expect(publisherIndex).toBeGreaterThan(verifierIndex);

    const verifier = workflow.slice(verifierIndex, publisherIndex);
    const publisher = workflow.slice(publisherIndex);

    expect(verifier).toContain("npm run release:verify");
    expect(verifier).not.toContain("actions/create-github-app-token");
    expect(verifier).not.toContain("NOEMA_MAINTAINER_APP_CLIENT_ID");
    expect(verifier).not.toContain("NOEMA_MAINTAINER_APP_PRIVATE_KEY");
    expect(verifier).not.toContain("gh pr create");
    expect(verifier).not.toContain("git push origin");

    expect(publisher).toMatch(
      /needs:\s*\n\s*- propose_product_increment\s*\n\s*- package_product_increment/,
    );
    expect(publisher).toContain(
      "actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093",
    );
    expect(publisher).toContain("artifact-ids:");
    expect(publisher).toContain(
      "Verify and apply immutable proposal without executing it",
    );
    expect(publisher).toContain(
      "Parse bounded untrusted pull-request metadata",
    );
    expect(publisher).toContain(
      "Mint dedicated maintainer App token only for publication",
    );
    expect(publisher).not.toContain("npm run release:verify");
    expect(publisher).not.toContain("NVIDIA_API_KEY");

    const applyIndex = publisher.indexOf(
      "Verify and apply immutable proposal without executing it",
    );
    const parserIndex = publisher.indexOf(
      "Parse bounded untrusted pull-request metadata",
    );
    const tokenIndex = publisher.indexOf(
      "Mint dedicated maintainer App token only for publication",
    );
    const revalidationIndex = publisher.indexOf(
      "Revalidate queue and default-branch head",
    );

    expect(applyIndex).toBeGreaterThan(-1);
    expect(parserIndex).toBeGreaterThan(applyIndex);
    expect(tokenIndex).toBeGreaterThan(parserIndex);
    expect(revalidationIndex).toBeGreaterThan(tokenIndex);
  });

  it("binds both fresh jobs to the same immutable upload artifact identity", () => {
    const workflow = workflowText();

    expect(workflow).toContain("id: upload_proposal");
    expect(workflow).toContain(
      "artifact_id: ${{ steps.upload_proposal.outputs.artifact-id }}",
    );
    expect(workflow).toContain(
      "artifact_digest: ${{ steps.upload_proposal.outputs.artifact-digest }}",
    );
    expect(workflow.match(/artifact-ids:/g)).toHaveLength(2);
    expect(workflow).toContain("expected_artifact_digest=");
    expect(workflow).toContain("downloaded_artifact_digest=");
  });

  it("keeps implementation plans aligned with the three-runner security boundary", () => {
    const documents = [
      architectureDocument(
        "docs/superpowers/specs/2026-08-05-hourly-nim-opencode-development-design.md",
      ),
      architectureDocument(
        "docs/superpowers/plans/2026-08-05-hourly-nim-opencode-development.md",
      ),
    ];

    for (const document of documents) {
      expect(document).toContain("propose_product_increment");
      expect(document).toContain("package_product_increment");
      expect(document).toContain("publish_product_increment");
      expect(document).toContain("artifact-id");
      expect(document).toContain("artifact-digest");
      expect(document).toContain("third fresh");
      expect(document).not.toContain("The same trusted job gates");
      expect(document).not.toContain(
        "The repository job has only `contents: write` and `pull-requests: write`",
      );
      expect(document).not.toContain(
        "Create one repository-pinned job with `contents: write`, `pull-requests: write`",
      );
    }
  });
});
