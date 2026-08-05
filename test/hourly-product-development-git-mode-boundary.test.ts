import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

describe("hourly product-development Git object boundary", () => {
  it("rejects both symlink and gitlink modes before handoff, verification, and publication", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow.match(/mode \(120000\|160000\)/g)).toHaveLength(3);
    expect(workflow.match(/symlink or gitlink/g)).toHaveLength(3);
  });
});
