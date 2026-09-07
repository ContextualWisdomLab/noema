import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime documentation protected authority", () => {
  it("does not describe the integrated #528 foundation as candidate active-PR truth", () => {
    const prd = readFileSync("docs/PRD.md", "utf8");
    const contextMap = readFileSync("docs/CONTEXT_MAP.md", "utf8");
    const adr = readFileSync("docs/adr/0012-runtime-orchestration-bounded-contexts.md", "utf8");

    expect(prd).not.toContain("On PR #528 this mode is **candidate truth only** until protected integration");
    expect(contextMap).not.toContain("PR #528 now carries a candidate bounded task-plan admission and runnable-task selector");
    expect(contextMap).not.toContain("PR #528 currently carries candidate checkpoint admission");
    expect(adr).not.toContain("The first candidate runtime code in PR #528 introduces");
    expect(prd).toContain("Protected `main` includes the Agent Runtime lifecycle and State / Checkpoint admission foundation");
    expect(contextMap).toContain("Protected `main` includes bounded task-plan admission and runnable-task selection");
    expect(adr).toContain("Protected `main` now contains the runtime-orchestration foundation delivered through PR #528");
    expect(adr).toContain("PR #544's Context Graph release-source-attestation and envelope-preserving-admission strengthening is now protected source");
  });
});
