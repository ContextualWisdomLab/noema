import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI live-base resolver availability", () => {
  it("falls back to the live Git ref REST endpoint after bounded GraphQL availability exhaustion", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

    expect(
      workflow.match(
        /gh api --method GET "repos\/\$\{GITHUB_REPOSITORY\}\/git\/ref\/heads\/\$\{NOEMA_PR_BASE_REF\}"/g,
      ),
    ).toHaveLength(2);
    expect(workflow.match(/--jq '\.object\.sha'/g)).toHaveLength(2);
    expect(workflow.match(/Live pull-request base REST fallback failed\./g)).toHaveLength(2);
    expect(workflow).not.toContain("github.event.pull_request.base.sha");
  });
});
