import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Noema agent sandbox plan", () => {
  const plan = readFileSync("docs/noema-agent-sandbox-plan.md", "utf8");

  it("anchors the Project #1 Noema review-bot roadmap item", () => {
    expect(plan).toContain("ContextualWisdomLab/noema#9");
    expect(plan).toContain("CWL Project #1");
    expect(plan).toContain("ContextualWisdomLab/naruon#974");
  });

  it("keeps token exchange separate from untrusted agent execution", () => {
    expect(plan).toContain("Noema Worker remains the token exchange boundary");
    expect(plan).toContain("separate quarantined execution plane");
    expect(plan).toMatch(/must not run untrusted repository code in\s+the Noema Worker process/);
  });

  it("requires visible evidence and CodeGraph status in review artifacts", () => {
    expect(plan).toContain("CodeGraph initialization is attempted before text-only search");
    expect(plan).toContain("every skipped tool, failed tool, missing SARIF/log, and blocked decision");
    expect(plan).toContain("review artifact preserves every reviewed PR comment");
  });
});
