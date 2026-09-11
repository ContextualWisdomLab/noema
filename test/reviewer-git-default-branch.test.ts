import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const REVIEWER_WORKFLOW = ".github/workflows/reviewer-ci.yml";

describe("reviewer-ci Git initialization", () => {
  it("makes every inherited git init use main without suppressing branch advice", () => {
    const workflow = readFileSync(REVIEWER_WORKFLOW, "utf8");

    expect(workflow).toContain('GIT_CONFIG_COUNT: "1"');
    expect(workflow).toContain("GIT_CONFIG_KEY_0: init.defaultBranch");
    expect(workflow).toContain("GIT_CONFIG_VALUE_0: main");
    expect(workflow).not.toContain("advice.defaultBranchName");
  });
});
