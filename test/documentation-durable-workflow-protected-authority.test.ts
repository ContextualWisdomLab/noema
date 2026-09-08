import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("durable workflow protected documentation authority", () => {
  it("describes #542 durable workflow/state source as protected without manufacturing deployment evidence", () => {
    const prd = readFileSync("docs/PRD.md", "utf8");
    const contextMap = readFileSync("docs/CONTEXT_MAP.md", "utf8");
    const adr = readFileSync("docs/adr/0012-runtime-orchestration-bounded-contexts.md", "utf8");

    expect(prd).toContain("Protected `main` also includes the durable Workflow / Task Execution slice integrated through #542");
    expect(prd).not.toContain("Durable workflow-state persistence, atomic claim/checkpoint execution, and richer recovery remain separate slices until independently integrated");
    expect(contextMap).toContain("Protected `main` also includes the durable execution slice integrated through #542");
    expect(contextMap).toContain("atomic task claim and checkpoint CAS");
    expect(adr).toContain("The durable Workflow / Task Execution slice integrated through #542 is protected source");
    expect(adr).not.toContain("Durable workflow persistence/routing work on a separate active lane remains candidate truth until its own protected integration");
    expect(adr).toContain("ADR 0013 remains `Proposed`");
  });
});
