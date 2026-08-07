import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

function runGit(root: string, args: string[]): string {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) throw result.error;
  if (result.signal) throw new Error(`Git fixture command terminated by ${result.signal}`);
  if (result.status !== 0) {
    throw new Error(`Git fixture command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return String(result.stdout ?? "").trim();
}

describe("acquisition exact-tree tracked-byte binding", () => {
  it("accepts the clean exact tree, then rejects worktree bytes matching a rewritten index", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-exact-tree-"));
    try {
      runGit(root, ["init", "--quiet"]);
      writeFileSync(join(root, "tracked.txt"), "trusted\n", "utf8");
      runGit(root, ["add", "tracked.txt"]);
      runGit(root, [
        "-c",
        "user.name=Noema Tests",
        "-c",
        "user.email=noema-tests@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "trusted fixture",
      ]);
      const exactHead = runGit(root, ["rev-parse", "HEAD"]);
      expect(verifyAcquisitionTrackedBytes({ cwd: root, exactHead })).toBe(1);

      // Model an index rewrite occurring after an earlier cached-diff phase:
      // both the index and worktree now agree on tampered bytes, while the
      // immutable exact HEAD tree still points at the original trusted blob.
      writeFileSync(join(root, "tracked.txt"), "tampered\n", "utf8");
      runGit(root, ["add", "tracked.txt"]);

      expect(() => verifyAcquisitionTrackedBytes({ cwd: root, exactHead }))
        .toThrow(/exact HEAD|authenticated Git.*bytes/i);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a non-exact tree identity before invoking Git", () => {
    expect(() => verifyAcquisitionTrackedBytes({ cwd: "/repo", exactHead: "HEAD" }))
      .toThrow("exact acquisition tree commit must be a full Git SHA");
  });
});
