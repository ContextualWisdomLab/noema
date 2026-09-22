import { describe, expect, it } from "vitest";

import {
  commercialCheckAppSlug,
  workflowAuthorityByCheckSuite,
} from "../scripts/hourly-commercial-readiness.mjs";

const repository = "ContextualWisdomLab/noema";
const headSha = "a".repeat(40);
const pullNumber = 730;

function run({
  suiteId,
  path,
  workflowUrl,
  event = "pull_request",
  runHeadSha = headSha,
  associatedPullNumbers = [pullNumber],
  associatedHeadSha = runHeadSha,
}: {
  suiteId: number;
  path: string;
  workflowUrl: string;
  event?: string;
  runHeadSha?: string;
  associatedPullNumbers?: number[];
  associatedHeadSha?: string;
}) {
  return {
    check_suite_id: suiteId,
    path,
    workflow_url: workflowUrl,
    event,
    head_sha: runHeadSha,
    pull_requests: associatedPullNumbers.map((number) => ({
      number,
      head: { sha: associatedHeadSha },
    })),
  };
}

function check(name: string, suiteId: number) {
  return {
    name,
    app: { slug: "github-actions" },
    check_suite: { id: suiteId },
  };
}

describe("commercial readiness workflow provenance", () => {
  it("admits local verify and reviewer only from their canonical repository workflows", () => {
    const authorities = workflowAuthorityByCheckSuite([
      run({
        suiteId: 11,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
      }),
      run({
        suiteId: 12,
        path: ".github/workflows/reviewer-ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/311182356`,
      }),
    ], repository, headSha, pullNumber);

    expect(commercialCheckAppSlug(check("verify", 11), authorities, [])).toBe("github-actions");
    expect(commercialCheckAppSlug(check("reviewer", 12), authorities, [])).toBe("github-actions");
    expect(commercialCheckAppSlug(
      check("verify", 11),
      authorities,
      [".github/workflows/ci.yml"],
    )).toBe("self-modified-workflow");
  });

  it("admits bundled scanner checks only from the organization-required Security Scan run", () => {
    const authorities = workflowAuthorityByCheckSuite([
      run({
        suiteId: 21,
        path: ".github/workflows/security-scan.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/required_workflows/311017545`,
      }),
      run({
        suiteId: 22,
        path: ".github/workflows/security-scan.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/999999999`,
      }),
    ], repository, headSha, pullNumber);

    expect(commercialCheckAppSlug(check("scorecard", 21), authorities, [])).toBe("github-actions");
    expect(commercialCheckAppSlug(check("osv-scan", 22), authorities, [])).toBe("untrusted-workflow");
  });

  it("fails closed on missing, stale, non-PR, or malformed workflow-run authority", () => {
    const authorities = workflowAuthorityByCheckSuite([
      run({
        suiteId: 31,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
        runHeadSha: "b".repeat(40),
      }),
      run({
        suiteId: 32,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
        event: "push",
      }),
    ], repository, headSha, pullNumber);

    expect(commercialCheckAppSlug(check("verify", 31), authorities, [])).toBe("untrusted-workflow");
    expect(commercialCheckAppSlug(check("verify", 32), authorities, [])).toBe("untrusted-workflow");
    expect(commercialCheckAppSlug(check("verify", 33), authorities, [])).toBe("untrusted-workflow");
  });

  it("rejects same-head workflow runs associated with another or ambiguous pull request", () => {
    const authorities = workflowAuthorityByCheckSuite([
      run({
        suiteId: 41,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
        associatedPullNumbers: [731],
      }),
      run({
        suiteId: 42,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
        associatedPullNumbers: [pullNumber, 731],
      }),
      run({
        suiteId: 43,
        path: ".github/workflows/ci.yml",
        workflowUrl: `https://api.github.com/repos/${repository}/actions/workflows/305751493`,
        associatedHeadSha: "b".repeat(40),
      }),
    ], repository, headSha, pullNumber);

    expect(commercialCheckAppSlug(check("verify", 41), authorities, [])).toBe("untrusted-workflow");
    expect(commercialCheckAppSlug(check("verify", 42), authorities, [])).toBe("untrusted-workflow");
    expect(commercialCheckAppSlug(check("verify", 43), authorities, [])).toBe("untrusted-workflow");
  });
});
