import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("pull-request workflow concurrency policy", () => {
  it.each([
    ["ci", ".github/workflows/ci.yml"],
    ["reviewer-ci", ".github/workflows/reviewer-ci.yml"],
  ])("cancels superseded %s runs without cancelling a different pull request", (_name, path) => {
    const workflow = readFileSync(path, "utf8");

    expect(workflow).toContain("concurrency:");
    expect(workflow).toContain(
      "${{ github.event.pull_request.number || github.ref }}",
    );
    expect(workflow).toContain("cancel-in-progress: true");
  });
});
