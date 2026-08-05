import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

const rawModeGate = `git diff --cached --raw | awk '
            /^:/ {
              old_mode = substr($1, 2)
              new_mode = $2
              if (old_mode ~ /^(120000|160000)$/ || new_mode ~ /^(120000|160000)$/) {
                found = 1
              }
            }
            END { exit(found ? 0 : 1) }
          '`;

describe("hourly product-development Git object boundary", () => {
  it("checks both source and target modes for symlinks and gitlinks at every boundary", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow.match(/git diff --cached --raw/g)).toHaveLength(3);
    expect(workflow.split(rawModeGate)).toHaveLength(4);
    expect(workflow).not.toContain("git diff --cached --summary");
    expect(workflow.match(/symlink or gitlink/g)).toHaveLength(3);
  });
});
