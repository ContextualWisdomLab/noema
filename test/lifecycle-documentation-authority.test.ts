import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

function readRepositoryFile(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("external-extension lifecycle documentation authority", () => {
  it("does not describe protected lifecycle source as PR #574 candidate authority", () => {
    const recovery = readRepositoryFile("docs/external-extension-lifecycle-recovery.md");
    const contextMap = readRepositoryFile("docs/CONTEXT_MAP.md");

    expect(recovery).toContain("protected source on `main` through PRs #574, #577, #578, #579, and #580");
    expect(recovery).not.toContain("Candidate authority on PR #574");

    expect(contextMap).toContain("SQLite-backed Worker Durable Object binding/runtime through #580");
    expect(contextMap).toContain("`NOEMA_EXTERNAL_EXTENSION_LIFECYCLE` → `NoemaExternalExtensionLifecycle`");
    expect(contextMap).not.toContain("Draft #574 extends that boundary");
    expect(contextMap).not.toContain("Draft #574 reuses the same Durable Object");
  });

  it("keeps source authority separate from production and release authority", () => {
    const recovery = readRepositoryFile("docs/external-extension-lifecycle-recovery.md");
    const contextMap = readRepositoryFile("docs/CONTEXT_MAP.md");

    expect(recovery).toContain("does **not** establish production deployment");
    expect(recovery).toContain("immutable release authority");
    expect(contextMap).toContain("source integration is not production deployment or immutable release authority");
    expect(contextMap).toContain("Real deployed Durable Object p95");
  });
});
