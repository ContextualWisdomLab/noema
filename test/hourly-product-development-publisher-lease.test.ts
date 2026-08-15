import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

/** Return the trusted publication job so lease assertions cannot match an untrusted stage. */
function publisherJob(): string {
  const workflow = readFileSync(workflowPath, "utf8");
  const start = workflow.indexOf("  publish_product_increment:");
  expect(start).toBeGreaterThan(-1);
  return workflow.slice(start);
}

describe("hourly product-development publisher ref lease", () => {
  it("atomically creates a proposal ref only when the remote ref is absent", () => {
    const publisher = publisherJob();
    const push = 'git push --force-with-lease="refs/heads/${branch}:" origin "HEAD:refs/heads/${branch}"';

    expect(publisher).toContain(push);
    expect(publisher).not.toContain('git push origin "HEAD:refs/heads/${branch}"');
    expect(publisher).not.toContain("git ls-remote --exit-code --heads origin");
  });

  it("never deletes a raced or subsequently changed proposal ref during cleanup", () => {
    const publisher = publisherJob();
    const headCapture = 'proposal_head="$(git rev-parse HEAD)"';
    const createPush = 'git push --force-with-lease="refs/heads/${branch}:" origin "HEAD:refs/heads/${branch}"';
    const cleanupLease = 'git push --force-with-lease="refs/heads/${branch}:${proposal_head}" origin ":refs/heads/${branch}"';
    const trap = "trap cleanup_remote_branch ERR";

    const headIndex = publisher.indexOf(headCapture);
    const pushIndex = publisher.indexOf(createPush);
    const trapIndex = publisher.indexOf(trap);

    expect(headIndex).toBeGreaterThan(-1);
    expect(pushIndex).toBeGreaterThan(headIndex);
    expect(trapIndex).toBeGreaterThan(pushIndex);
    expect(publisher).toContain(cleanupLease);
    expect(publisher).not.toContain('git push origin --delete "$branch"');
  });

  it("arms recoverable numeric cleanup before machine-readable PR creation", () => {
    const publisher = publisherJob();
    const marker = "publication_marker=";
    const createPr = 'gh api --method POST "repos/${GITHUB_REPOSITORY}/pulls" --input "$pr_request_file"';
    const parseNumber = 'pr_number="$(jq -r';
    const recoverNumber = "recover_created_pr_number";
    const installCreatedPrCleanup = "trap cleanup_created_pr ERR";
    const closeCreatedPr = 'gh api --method PATCH "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" -f state=closed';
    const readCreatedPr = 'gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}"';
    const headGuard = '[ "$live_pr_head" != "$proposal_head" ]';
    const baseGuard = '[ "$live_pr_base" != "$expected_base" ]';
    const clearTrap = "trap - ERR";

    const markerIndex = publisher.indexOf(marker);
    const cleanupTrapIndex = publisher.indexOf(installCreatedPrCleanup, markerIndex);
    const createPrIndex = publisher.indexOf(createPr, cleanupTrapIndex);
    const parseNumberIndex = publisher.indexOf(parseNumber, createPrIndex);
    const readCreatedPrIndex = publisher.indexOf(readCreatedPr, parseNumberIndex);
    const headGuardIndex = publisher.indexOf(headGuard, readCreatedPrIndex);
    const baseGuardIndex = publisher.indexOf(baseGuard, readCreatedPrIndex);
    const clearTrapIndex = publisher.indexOf(
      clearTrap,
      Math.max(headGuardIndex, baseGuardIndex),
    );

    expect(markerIndex).toBeGreaterThan(-1);
    expect(cleanupTrapIndex).toBeGreaterThan(markerIndex);
    expect(createPrIndex).toBeGreaterThan(cleanupTrapIndex);
    expect(parseNumberIndex).toBeGreaterThan(createPrIndex);
    expect(readCreatedPrIndex).toBeGreaterThan(parseNumberIndex);
    expect(headGuardIndex).toBeGreaterThan(readCreatedPrIndex);
    expect(baseGuardIndex).toBeGreaterThan(readCreatedPrIndex);
    expect(clearTrapIndex).toBeGreaterThan(Math.max(headGuardIndex, baseGuardIndex));
    expect(publisher).toContain(recoverNumber);
    expect(publisher).toContain("pulls?state=open&head=");
    expect(publisher).toContain(closeCreatedPr);
    expect(publisher).not.toContain("gh pr create");
    expect(publisher).not.toContain('gh pr close "$pr_url"');
  });

  it("revalidates a known PR number before cleanup can close it", () => {
    const publisher = publisherJob();
    const cleanupStart = publisher.indexOf("cleanup_created_pr() {");
    const cleanupEnd = publisher.indexOf("trap cleanup_created_pr ERR", cleanupStart);
    const cleanup = publisher.slice(cleanupStart, cleanupEnd);
    const recover = 'pr_number="$(recover_created_pr_number 2>/dev/null || true)"';
    const closeCreatedPr = 'gh api --method PATCH "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}" -f state=closed';

    expect(cleanupStart).toBeGreaterThan(-1);
    expect(cleanupEnd).toBeGreaterThan(cleanupStart);
    expect(cleanup.indexOf(recover)).toBeGreaterThan(-1);
    expect(cleanup.indexOf(closeCreatedPr)).toBeGreaterThan(cleanup.indexOf(recover));
    expect(cleanup).not.toContain('if ! [[ "${pr_number:-}" =~ ^[1-9][0-9]*$ ]]');
  });

  it("rechecks the fully paginated open-PR queue after creation before accepting publication", () => {
    const publisher = publisherJob();
    const baseGuard = '[ "$live_pr_base" != "$expected_base" ]';
    const paginatedInventory = "gh api --paginate";
    const openPullsEndpoint = 'repos/${GITHUB_REPOSITORY}/pulls?state=open&per_page=100';
    const numberProjection = "--jq '.[].number'";
    const queueConflict = "created_pull_request_queue_conflict";
    const clearTrap = "trap - ERR";

    const baseGuardIndex = publisher.indexOf(baseGuard);
    const inventoryIndex = publisher.indexOf(paginatedInventory, baseGuardIndex);
    const queueConflictIndex = publisher.indexOf(queueConflict, inventoryIndex);
    const clearTrapIndex = publisher.indexOf(clearTrap, queueConflictIndex);

    expect(baseGuardIndex).toBeGreaterThan(-1);
    expect(inventoryIndex).toBeGreaterThan(baseGuardIndex);
    expect(publisher).toContain(openPullsEndpoint);
    expect(publisher).toContain(numberProjection);
    expect(queueConflictIndex).toBeGreaterThan(inventoryIndex);
    expect(clearTrapIndex).toBeGreaterThan(queueConflictIndex);
  });
});
