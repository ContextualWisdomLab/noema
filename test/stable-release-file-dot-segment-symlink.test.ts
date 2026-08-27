import { afterEach, describe, expect, it } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { join, sep } from "node:path";
import { tmpdir } from "node:os";
import { readStableRegularFile } from "../scripts/lib/stable-file-evidence.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("stable release evidence path canonicality", () => {
  it("rejects a dot-segment path whose raw lookup traverses a symlinked parent", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-stable-path-"));
    temporaryRoots.push(root);
    const safeDirectory = join(root, "safe");
    const attackerDirectory = join(root, "attacker");
    const attackerNestedDirectory = join(attackerDirectory, "nested");
    mkdirSync(safeDirectory, { recursive: true });
    mkdirSync(attackerNestedDirectory, { recursive: true });
    writeFileSync(join(attackerDirectory, "evidence.json"), "attacker-controlled-evidence");
    symlinkSync(attackerNestedDirectory, join(safeDirectory, "link"), "dir");

    const ambiguousPath = `${safeDirectory}${sep}link${sep}..${sep}evidence.json`;

    expect(() => readStableRegularFile(
      ambiguousPath,
      "release evidence",
      1024,
    )).toThrow(/absolute lexical-canonical path/);
  });
});
