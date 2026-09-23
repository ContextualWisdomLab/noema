import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { parseNoemaReviewDecision } from "../scripts/hourly-commercial-readiness.mjs";

const currentHead = "a".repeat(40);
const currentBase = "b".repeat(40);
const staleBase = "c".repeat(40);
const trustedReviewerLogin = "noema-reviewer[bot]";
const credentialLine = "- Reviewer credential: `noema-github-app`";

function canonicalBody(baseSha: string) {
  return [
    "## Noema PydanticAI review",
    "",
    `- Base SHA: \`${baseSha}\``,
    credentialLine,
    "",
    `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`,
  ].join("\n");
}

function legacyHeadOnlyBody() {
  return [
    "## Noema PydanticAI review",
    "",
    credentialLine,
    "",
    `<!-- noema-review-gate head_sha=${currentHead} decision=approve -->`,
  ].join("\n");
}

function approvedReview(body: string) {
  return {
    id: 730,
    submitted_at: "2026-09-23T12:00:00Z",
    commit_id: currentHead,
    state: "APPROVED",
    user: { login: trustedReviewerLogin, type: "Bot" },
    body,
  };
}

describe("Noema review live-base authority", () => {
  it("does not admit a legacy head-only approval as current-base review authority", () => {
    expect(parseNoemaReviewDecision(
      [approvedReview(legacyHeadOnlyBody())],
      currentHead,
      trustedReviewerLogin,
    )).toBeNull();
  });

  it("binds formal Noema approval to both the exact head and the evaluated base SHA", () => {
    expect(parseNoemaReviewDecision.length).toBe(4);
    const parseBaseBoundDecision = parseNoemaReviewDecision as unknown as (
      reviews: ReturnType<typeof approvedReview>[],
      expectedHeadSha: string,
      expectedBaseSha: string,
      reviewerLogin: string,
    ) => string | null;

    expect(parseBaseBoundDecision(
      [approvedReview(canonicalBody(currentBase))],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBe("approve");
    expect(parseBaseBoundDecision(
      [approvedReview(canonicalBody(staleBase))],
      currentHead,
      currentBase,
      trustedReviewerLogin,
    )).toBeNull();
  });

  it("requires the reviewer publisher and CLI to carry and revalidate manifest base authority", () => {
    const githubIo = readFileSync("reviewer/noema_reviewer/github_io.py", "utf8");
    const cli = readFileSync("reviewer/noema_reviewer/cli.py", "utf8");

    expect(githubIo).toContain('f"- Base SHA: `{base_sha}`"');
    expect(githubIo).toContain('"{state: .state, head: .head.sha, base: .base.sha}"');
    expect(githubIo).toContain("live_base != base_sha");
    expect(cli).toContain("manifest.base_sha");
  });
});
