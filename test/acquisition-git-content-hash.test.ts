import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`Git fixture command terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`Git fixture command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
}

describe("acquisition exact tracked-byte authentication", () => {
  it.skipIf(process.platform === "win32")(
    "rejects same-size content drift even when Git's stat cache reports a clean worktree",
    () => {
      const root = mkdtempSync(join(tmpdir(), "noema-acquisition-content-hash-"));
      const trackedPath = join(root, "tracked.txt");
      const oldTimestamp = new Date("2020-01-01T00:00:00.000Z");
      try {
        runGit(root, ["init", "--quiet"]);
        runGit(root, ["config", "core.trustctime", "false"]);
        runGit(root, ["config", "core.checkStat", "minimal"]);
        writeFileSync(trackedPath, "tracked\n", "utf8");
        utimesSync(trackedPath, oldTimestamp, oldTimestamp);
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

        const committedMetadata = statSync(trackedPath);
        writeFileSync(trackedPath, "tamperd\n", "utf8");
        utimesSync(trackedPath, committedMetadata.atime, committedMetadata.mtime);

        const cachedComparison = spawnSync(
          "git",
          ["diff-files", "--quiet", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--"],
          { cwd: root, encoding: "utf8", timeout: 10_000 },
        );
        expect(cachedComparison.error).toBeUndefined();
        expect(cachedComparison.signal).toBeNull();
        expect(cachedComparison.status).toBe(0);

        expect(() => verifyAcquisitionTrackedBytes({ cwd: root }))
          .toThrow("tracked checkout differs from its authenticated Git index bytes");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
