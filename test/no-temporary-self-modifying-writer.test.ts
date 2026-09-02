import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

const temporaryWriterArtifacts = [
  ".github/source-fix-no-heuristic-orchestrator-free.trigger",
  ".github/workflows/source-fix-no-heuristic-orchestrator-free.yml",
  "scripts/source_fix_no_heuristic_orchestrator_free.py",
] as const;

describe("Noema writer lease", () => {
  it("forbids temporary self-modifying source-fix writers", () => {
    const present = temporaryWriterArtifacts.filter((path) =>
      existsSync(join(repositoryRoot, path)),
    );

    expect(present).toEqual([]);
  });
});
