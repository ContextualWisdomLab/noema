import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveAcquisitionCommit,
  verifyAcquisitionTrackedCheckout,
} from "../scripts/lib/acquisition-git-preflight.mjs";

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal || result.status !== 0) {
    throw new Error(`fixture Git command failed: ${String(result.stderr ?? "").trim()}`);
  }
}

function createRepository() {
  const root = mkdtempSync(join(tmpdir(), "noema-acquisition-worktree-root-"));
  writeFileSync(join(root, "tracked.txt"), "tracked\n");
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["add", "tracked.txt"]);
  runGit(root, [
    "-c",
    "user.name=Noema Tests",
    "-c",
    "user.email=noema-tests@example.invalid",
    "commit",
    "--quiet",
    "-m",
    "fixture",
  ]);
  return root;
}

describe("acquisition Git worktree binding", () => {
  it("refuses repository-local core.worktree redirection away from the audited checkout", () => {
    const root = createRepository();
    const redirected = mkdtempSync(join(tmpdir(), "noema-acquisition-worktree-decoy-"));
    try {
      writeFileSync(join(redirected, "tracked.txt"), "tracked\n");
      runGit(root, ["config", "core.worktree", redirected]);
      writeFileSync(join(root, "tracked.txt"), "tampered\n");

      const exactHead = resolveAcquisitionCommit("HEAD", { cwd: root });
      expect(() => verifyAcquisitionTrackedCheckout({
        cwd: root,
        expectedCommitSha: exactHead,
      })).toThrow(`tracked checkout differs from exact HEAD ${exactHead}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(redirected, { recursive: true, force: true });
    }
  });
});
