import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOT = join(ROOT, "src");
const DOCS_ROOT = join(ROOT, "docs");
const RUNTIME_BOUNDARY_ADR = join(DOCS_ROOT, "adr", "0012-runtime-orchestration-bounded-contexts.md");

const FORBIDDEN_PROVIDER_DEPENDENCIES = [
  "openai",
  "@anthropic-ai/sdk",
  "@google/generative-ai",
  "@google/genai",
  "litellm",
] as const;

const FORBIDDEN_FOREIGN_IMPLEMENTATION_MARKERS = [
  "ContextualWisdomLab/contextual-orchestrator/src",
  "ContextualWisdomLab/context-graph-contracts/src",
  "ContextualWisdomLab/enterprise-architecture-core/src",
  "ContextualWisdomLab/naruon/src",
  "ContextualWisdomLab/wardnet/src",
] as const;

function filesRecursively(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...filesRecursively(path));
      continue;
    }
    files.push(path);
  }
  return files;
}

function productionSourceFiles(): string[] {
  return filesRecursively(SOURCE_ROOT).filter((path) => path.endsWith(".ts") || path.endsWith(".mjs"));
}

describe("Noema bounded-context fitness", () => {
  it("keeps provider routing and foreign product implementation outside Noema production source", () => {
    const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const packageNames = new Set([
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
    ]);

    for (const dependency of FORBIDDEN_PROVIDER_DEPENDENCIES) {
      expect(packageNames.has(dependency), `${dependency} must remain owned by contextual-orchestrator`).toBe(false);
    }

    const violations: string[] = [];
    for (const file of productionSourceFiles()) {
      const source = readFileSync(file, "utf8");
      for (const marker of FORBIDDEN_FOREIGN_IMPLEMENTATION_MARKERS) {
        if (source.includes(marker)) violations.push(`${relative(ROOT, file)} -> ${marker}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("keeps one canonical Context Map aligned with the PRD current authority", () => {
    const canonicalRelativePath = "docs/CONTEXT_MAP.md";
    const contextMapPaths = filesRecursively(DOCS_ROOT)
      .map((path) => relative(ROOT, path).replaceAll("\\", "/"))
      .filter((path) => /(^|\/)CONTEXT_MAP\.md$/i.test(path));
    expect(contextMapPaths).toEqual([canonicalRelativePath]);

    const contextMap = readFileSync(join(ROOT, canonicalRelativePath), "utf8");
    const docsIndex = readFileSync(join(DOCS_ROOT, "README.md"), "utf8");
    const prd = readFileSync(join(DOCS_ROOT, "PRD.md"), "utf8");
    const currentAuthority = "evidence-producing credential and maintenance control plane";
    const requiredBoundaries = [
      "Credential Exchange",
      "Maintenance Control",
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
    expect(adr).toContain("immutable released context-graph-contracts");
    expect(adr).toContain("cross-service SQL");
  });
});