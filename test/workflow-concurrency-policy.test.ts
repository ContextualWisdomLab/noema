import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflowPaths = [
  ["ci", ".github/workflows/ci.yml"],
  ["reviewer-ci", ".github/workflows/reviewer-ci.yml"],
  ["patch-validator-image", ".github/workflows/patch-validator-image.yml"],
] as const;

describe("pull-request workflow execution policy", () => {
  it.each(workflowPaths)(
    "cancels superseded %s runs without cancelling a different pull request",
    (_name, path) => {
      const workflow = readFileSync(path, "utf8");

      expect(workflow).toContain("concurrency:");
      expect(workflow).toContain(
        "group: ${{ github.workflow }}-${{ github.repository }}-${{ github.event_name == 'pull_request' && github.event.pull_request.number || github.run_id }}",
      );
      expect(workflow).toContain(
        "cancel-in-progress: ${{ github.event_name == 'pull_request' }}",
      );
    },
  );

  it.each(workflowPaths)("pins every external action in %s by immutable commit", (_name, path) => {
    const workflow = readFileSync(path, "utf8");
    const actionReferences = [...workflow.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s*#.*)?$/gm)].map(
      (match) => match[1],
    );

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^[^@]+@[0-9a-f]{40}$/);
    }
  });
});
