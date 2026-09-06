import { mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { canonicalTempRoot } from "./support/canonical-temp-root";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("canonicalTempRoot", () => {
  it("resolves a symlinked temp-root alias before security-sensitive fixtures are created", () => {
    const physicalRoot = realpathSync(tmpdir());
    const directory = mkdtempSync(join(physicalRoot, "noema-canonical-temp-root-"));
    temporaryDirectories.push(directory);
    const alias = join(directory, "alias");
    symlinkSync(physicalRoot, alias, "dir");

    expect(canonicalTempRoot(alias)).toBe(physicalRoot);
  });
});
