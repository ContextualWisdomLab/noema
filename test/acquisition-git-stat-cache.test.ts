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
import { verifyAcquisitionTrackedCheckout } from "../scripts/lib/acquisition-git-preflight.mjs";

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

describe("acquisition Git stat-cache boundary", () => {
  it.skipIf(process.platform === "win32")(
    "rejects same-size tracked tampering hidden by repository-local stat settings",
    () => {
      const root = mkdtempSync(join(tmpdir(), "noema-acquisition-stat-cache-"));
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
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1_100);
        writeFileSync(trackedPath, "tamperd\n", "utf8");
        utimesSync(trackedPath, committedMetadata.atime, committedMetadata.mtime);

        const unisolatedComparison = spawnSync(
          "git",
          ["diff-files", "--quiet", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--"],
          { cwd: root, encoding: "utf8", timeout: 10_000 },
        );
        expect(unisolatedComparison.error).toBeUndefined();
        expect(unisolatedComparison.signal).toBeNull();
        expect(unisolatedComparison.status).toBe(0);

        expect(() => verifyAcquisitionTrackedCheckout({ cwd: root }))
          .toThrow("tracked checkout differs from exact HEAD");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
