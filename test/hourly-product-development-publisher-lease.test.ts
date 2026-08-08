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

  it("binds a created pull request to the verified proposal head and base before clearing cleanup", () => {
    const publisher = publisherJob();
    const createPr = "gh pr create";
    const readCreatedPr = 'gh api "repos/${GITHUB_REPOSITORY}/pulls/${pr_number}"';
    const headGuard = '[ "$live_pr_head" != "$proposal_head" ]';
    const baseGuard = '[ "$live_pr_base" != "$expected_base" ]';
    const closeCreatedPr = 'gh pr close "$pr_url" --repo "$GITHUB_REPOSITORY"';
    const clearTrap = "trap - ERR";

    const createPrIndex = publisher.indexOf(createPr);
    const readCreatedPrIndex = publisher.indexOf(readCreatedPr);
    const headGuardIndex = publisher.indexOf(headGuard);
    const baseGuardIndex = publisher.indexOf(baseGuard);
    const clearTrapIndex = publisher.indexOf(clearTrap);

    expect(createPrIndex).toBeGreaterThan(-1);
    expect(readCreatedPrIndex).toBeGreaterThan(createPrIndex);
    expect(headGuardIndex).toBeGreaterThan(readCreatedPrIndex);
    expect(baseGuardIndex).toBeGreaterThan(readCreatedPrIndex);
    expect(clearTrapIndex).toBeGreaterThan(Math.max(headGuardIndex, baseGuardIndex));
    expect(publisher).toContain(closeCreatedPr);
  });
});
