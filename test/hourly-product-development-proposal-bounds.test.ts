import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";

describe("hourly product-development proposal resource bounds", () => {
  it("counts changed paths without retaining every pathname chunk", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow).not.toContain("Buffer.concat(chunks)");
    expect(workflow).not.toContain('process.stdin.on("data", (chunk) => chunks.push(chunk))');
    expect(workflow).toContain("changed_file_count += 1");
    expect(workflow).toContain("for (const byte of chunk)");
  });
});
