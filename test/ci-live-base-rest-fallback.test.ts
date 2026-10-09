import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CI live pull-request identity availability", () => {
  it("reads live PR head/ref and resolves the current base branch tip", () => {
    const gate = readFileSync(
      "scripts/verify-live-pull-request-identity.sh",
      "utf8",
    );

    expect(gate).toContain(
      'gh api --method GET "repos/${GITHUB_REPOSITORY}/pulls/${NOEMA_PR_NUMBER}"',
    );
    expect(gate).toContain("--jq '[.head.sha,.base.ref] | @tsv'");
    expect(gate).toContain(
      'gh api --method GET "repos/${GITHUB_REPOSITORY}/git/ref/heads/${base_ref}"',
    );
    expect(gate).toContain("--jq '.object.sha'");
    expect(gate).not.toContain(".base.sha");
    expect(gate).toContain("for attempt in 1 2 3; do");
    expect(gate).toContain("\\(HTTP (502|503|504)\\)$");
    expect(gate).not.toContain("gh api graphql");
  });
});
