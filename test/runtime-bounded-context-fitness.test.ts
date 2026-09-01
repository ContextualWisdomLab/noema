import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOT = join(ROOT, "src");

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

function sourceFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (entry.endsWith(".ts") || entry.endsWith(".mjs")) files.push(path);
  }
  return files;
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
    for (const file of sourceFiles(SOURCE_ROOT)) {
      const source = readFileSync(file, "utf8");
      for (const marker of FORBIDDEN_FOREIGN_IMPLEMENTATION_MARKERS) {
        if (source.includes(marker)) violations.push(`${relative(ROOT, file)} -> ${marker}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("publishes one code-current Context Map before runtime orchestration expands", () => {
    const contextMap = readFileSync(join(ROOT, "docs", "CONTEXT_MAP.md"), "utf8");
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

    for (const boundary of requiredBoundaries) {
      expect(contextMap).toContain(boundary);
    }
    expect(contextMap).toContain("released");
    expect(contextMap).toContain("cross-service SQL");
  });
});
