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
      "pre_publish_tag_sha=\"$(gh api \"repos/${GITHUB_REPOSITORY}/commits/${RELEASE_TAG}\" --jq '.sha')\"",
      createIndex,
    );
    const publishIndex = publishJob.indexOf("gh api --method PATCH", createIndex);

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

  it("uses the authenticated release inventory for draft absence and exact staged-draft identity", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const publishJob = workflow.slice(workflow.indexOf("  publish_release:"));
    const createIndex = publishJob.indexOf('gh release create "$RELEASE_TAG"');
    const publishIndex = publishJob.indexOf("gh api --method PATCH", createIndex);
    const preCreate = publishJob.slice(0, createIndex);
    const stagedPublication = publishJob.slice(createIndex, publishIndex);

    expect(preCreate).toContain("existing-release-inventory.json");
    expect(preCreate).toContain("--paginate --slurp");
    expect(preCreate).toContain(".tag_name == $tag");
    expect(stagedPublication).toContain("release-draft-inventory.json");
    expect(stagedPublication).toContain("--paginate --slurp");
    expect(stagedPublication).toContain(
      "[.[][] | select(.tag_name == $tag)] | length",
    );
    expect(stagedPublication).toContain("length == 1");
    expect(stagedPublication).not.toContain(
      '"repos/${GITHUB_REPOSITORY}/releases/tags/${RELEASE_TAG}"',
    );
  });

  it("binds publication to the one verified draft release id", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const publishJob = workflow.slice(workflow.indexOf("  publish_release:"));

    expect(publishJob).toContain(
      "[.[][] | select(.tag_name == $tag)] | length",
    );
    expect(publishJob).toContain(
      '.draft == true and .immutable == false and .tag_name == $tag and (.id | type == "number")',
    );
    expect(publishJob).toContain(
      "release_id=\"$(jq -r '.id' \"$publication_dir/release-draft-api.json\")\"",
    );
    expect(publishJob).toContain(
      '"repos/${GITHUB_REPOSITORY}/releases/${release_id}"',
    );
    expect(publishJob).toContain("--method PATCH");
    expect(publishJob).toContain("-F draft=false");
    expect(publishJob).not.toContain(
      'gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false',
    );
  });

  it("documents the authenticated inventory absence proof and staged publication boundary", () => {
    const guide = readFileSync(publicationGuidePath, "utf8");

    expect(guide).toContain("draft");
    expect(guide).toContain("authenticated release inventory");
    expect(guide).toContain("re-checks the release tag after asset staging and immediately before publication");
    expect(guide).toContain("verified draft release ID");
    expect(guide).toContain("tag remains mutable until the draft is published");
    expect(guide).not.toContain("release absence cannot be proved as HTTP 404");
    expect(guide).not.toContain("release absence cannot be proven as HTTP 404");
    expect(guide).not.toContain("publishes the complete asset set in one `gh release create ... --verify-tag` transaction");
  });
});
