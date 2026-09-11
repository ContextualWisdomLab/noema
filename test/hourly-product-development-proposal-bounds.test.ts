import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

describe("hourly product-development proposal resource bounds", () => {
  it("counts and compares changed paths without retaining the pathname stream", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).not.toContain("Buffer.concat(chunks)");
    expect(workflow).not.toContain('process.stdin.on("data", (chunk) => chunks.push(chunk))');
    expect(workflow.match(/changed_file_count \+= 1/g)).toHaveLength(3);
    expect(workflow.match(/for \(const byte of chunk\)/g)).toHaveLength(3);
    expect(workflow).toContain("while IFS= read -r -d '' proposal_path; do");
  });
});
