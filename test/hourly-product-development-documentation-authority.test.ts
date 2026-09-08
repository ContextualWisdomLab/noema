import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workConservingDocs = [
  "docs/contextual-orchestrator-reviewer-cutover.md",
  "docs/development/contributor-and-agent-procedure.md",
] as const;

describe("hourly product-development documentation authority", () => {
  it("does not restore the superseded global empty-PR admission rule", () => {
    for (const path of workConservingDocs) {
      const text = readFileSync(path, "utf8");

      expect(text, path).not.toMatch(/(?:pull-request|PR) queue is empty/i);
      expect(text, path).toContain("work-conserving");
      expect(text, path).toContain("changed path");
    }
  });
});
