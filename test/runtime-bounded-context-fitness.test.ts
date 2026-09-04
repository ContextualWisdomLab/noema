import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const DOCS_ROOT = join(process.cwd(), "docs");
const RUNTIME_BOUNDARY_ADR = join(DOCS_ROOT, "adr", "0012-runtime-orchestration-bounded-contexts.md");

const currentAuthority = "main@bbee33270b496255d785c766fc009a5f9162a695";

describe("Noema bounded-context fitness", () => {
  it("keeps canonical runtime artifacts anchored to protected authority", () => {
    const architecture = readFileSync(join(process.cwd(), "ARCHITECTURE.md"), "utf8");
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const trd = readFileSync(join(DOCS_ROOT, "TRD.md"), "utf8");
    const contextMap = readFileSync(join(DOCS_ROOT, "CONTEXT_MAP.md"), "utf8");
    const baseline = readFileSync(join(DOCS_ROOT, "product-technical-gap-baseline.md"), "utf8");

    for (const artifact of [architecture, prd, trd, contextMap, baseline]) {
      expect(artifact).toContain(currentAuthority);
    }
  });

  it("keeps every canonical artifact on the same eight runtime bounded contexts", () => {
    const architecture = readFileSync(join(process.cwd(), "ARCHITECTURE.md"), "utf8");
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const trd = readFileSync(join(DOCS_ROOT, "TRD.md"), "utf8");
    const contextMap = readFileSync(join(DOCS_ROOT, "CONTEXT_MAP.md"), "utf8");
    const baseline = readFileSync(join(DOCS_ROOT, "product-technical-gap-baseline.md"), "utf8");
    const requiredBoundaries = [
      "Agent Runtime",
      "Workflow / Task Execution",
      "Tool / Capability Boundary",
      "State / Checkpoint",
      "Isolation Integration",
      "Policy / Approval",
      "Observability",
      "Recovery",
    ];

    for (const artifact of [architecture, prd, trd, contextMap, baseline]) {
      for (const boundary of requiredBoundaries) {
        expect(artifact).toContain(boundary);
      }
    }
  });

  it("keeps foreign authority explicitly outside Noema", () => {
    const architecture = readFileSync(join(process.cwd(), "ARCHITECTURE.md"), "utf8");
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const trd = readFileSync(join(DOCS_ROOT, "TRD.md"), "utf8");
    const contextMap = readFileSync(join(DOCS_ROOT, "CONTEXT_MAP.md"), "utf8");
    const requiredForeignOwners = [
      "contextual-orchestrator",
      "context-graph-contracts",
      "enterprise-architecture-core",
    ];

    for (const artifact of [architecture, prd, trd, contextMap]) {
      for (const owner of requiredForeignOwners) {
        expect(artifact).toContain(owner);
      }
      expect(artifact).toContain("cross-service SQL");
    }
  });

  it("publishes one canonical context map from the docs index", () => {
    const docsIndex = readFileSync(join(DOCS_ROOT, "README.md"), "utf8");
    const contextMap = readFileSync(join(DOCS_ROOT, "CONTEXT_MAP.md"), "utf8");
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const requiredBoundaries = [
      "Agent Runtime",
      "Workflow / Task Execution",
      "Tool / Capability Boundary",
      "State / Checkpoint",
      "Isolation Integration",
      "Policy / Approval",
      "Observability",
      "Recovery",
      "contextual-orchestrator",
      "context-graph-contracts",
      "enterprise-architecture-core",
    ];

    expect((docsIndex.match(/\[Context Map\]\(\.\/CONTEXT_MAP\.md\)/g) ?? [])).toHaveLength(1);
    expect(contextMap).toContain(currentAuthority);
    expect(prd).toContain(currentAuthority);
    for (const boundary of requiredBoundaries) {
      expect(contextMap).toContain(boundary);
    }
    expect(contextMap).toContain("Noema may integrate only against an immutable released contract package/profile.");
    expect(contextMap).toContain("cross-service SQL");
  });

  it("binds candidate runtime implementation to explicit PRD and ADR authority", () => {
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const adr = readFileSync(RUNTIME_BOUNDARY_ADR, "utf8");

    expect(prd).toContain("### 4.7 Agent/application runtime orchestration");
    expect(prd).toContain("FR-019");
    expect(prd).toContain("FR-020");
    expect(prd).toContain("contextual-orchestrator remains the sole model discovery and routing owner");

    expect(adr).toContain("Status: Proposed");
    expect(adr).toContain("Agent Runtime");
    expect(adr).toContain("State / Checkpoint");
    expect(adr).toContain("contextual-orchestrator");
    expect(adr).toContain("immutable released `context-graph-contracts`");
    expect(adr).toContain("cross-service SQL");
  });
});