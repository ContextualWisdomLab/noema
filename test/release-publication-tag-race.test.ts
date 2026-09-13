import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/release-evidence.yml";
const publicationGuidePath = "docs/immutable-release-publication.md";

describe("immutable release pre-publication tag stability", () => {
  it("stages the bounded asset set as a draft and revalidates the tag before publish", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const publishJob = workflow.slice(workflow.indexOf("  publish_release:"));
    const createIndex = publishJob.indexOf('gh release create "$RELEASE_TAG"');
    const draftIndex = publishJob.indexOf("--draft", createIndex);
    const recheckIndex = publishJob.indexOf(
      'pre_publish_tag_sha="$(gh api "repos/${GITHUB_REPOSITORY}/commits/${RELEASE_TAG}" --jq \'.sha\')"',
      createIndex,
    );
    const publishIndex = publishJob.indexOf(
      'gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false',
      createIndex,
    );

    expect(createIndex).toBeGreaterThan(-1);
    expect(draftIndex).toBeGreaterThan(createIndex);
    expect(recheckIndex).toBeGreaterThan(draftIndex);
    expect(publishIndex).toBeGreaterThan(recheckIndex);

    const stagedPublication = publishJob.slice(createIndex, publishIndex);
    expect(stagedPublication).toContain(
      'if [ "$pre_publish_tag_sha" != "$RELEASE_COMMIT_SHA" ]; then',
    );
    expect(stagedPublication).toContain(
      "Release tag moved after draft asset staging; refusing publication.",
    );
  });

  it("documents that immutable protection begins only when the staged draft is published", () => {
    const guide = readFileSync(publicationGuidePath, "utf8");

    expect(guide).toContain("draft");
    expect(guide).toContain("re-checks the release tag after asset staging and immediately before publication");
    expect(guide).toContain("the tag remains mutable until the draft is published");
    expect(guide).not.toContain("publishes the complete asset set in one `gh release create ... --verify-tag` transaction");
  });
});
