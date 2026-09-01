import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { verifyAcquisitionTrackedFileBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

function runGit(root: string, args: string[]) {
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
  return result;
}

describe("acquisition pinned empty-byte authentication", () => {
  it.each([undefined, null])("authenticates omitted or null bytes as an empty tracked blob (%s)", (bytes) => {
    const root = mkdtempSync(join(tmpdir(), "noema-acquisition-empty-bytes-"));
    try {
      runGit(root, ["init", "--quiet"]);
      writeFileSync(join(root, "empty.txt"), Buffer.alloc(0));
      runGit(root, ["add", "empty.txt"]);
      runGit(root, [
        "-c",
        "user.name=Noema Tests",
        "-c",
        "user.email=noema-tests@example.invalid",
        "commit",
        "--quiet",
        "-m",
        "empty tracked blob",
      ]);
      const exactHead = String(runGit(root, ["rev-parse", "HEAD"]).stdout).trim();
      const objectId = String(runGit(root, ["rev-parse", `${exactHead}:empty.txt`]).stdout).trim();

      expect(verifyAcquisitionTrackedFileBytes({
        cwd: root,
        exactHead,
        path: "empty.txt",
        bytes,
      })).toBe(objectId);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
