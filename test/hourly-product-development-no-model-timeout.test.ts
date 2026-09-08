import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readJobSlice } from "./helpers/hourly-workflow";

const workflowPath = ".github/workflows/hourly-product-development.yml";

describe("hourly product-development termination authority", () => {
  it("leaves model execution without a repository-authored wall clock", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const proposer = readJobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );

    expect(proposer).not.toContain("timeout-minutes:");
    expect(workflow).not.toContain("OPENCODE_RUN_TIMEOUT_SECONDS");
    expect(workflow).not.toContain("OPENCODE_KILL_GRACE_SECONDS");
    expect(workflow).not.toContain("timeout --kill-after=");
    expect(workflow).toContain('opencode run "$prompt" --agent build');
  });
});
