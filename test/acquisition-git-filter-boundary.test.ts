import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

function createFilterRepository() {
  const root = mkdtempSync(join(tmpdir(), "noema-acquisition-filter-root-"));
  writeFileSync(join(root, "tracked.txt"), "base\n");
  writeFileSync(join(root, ".gitattributes"), "tracked.txt filter=noema-test-filter\n");
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["add", "tracked.txt", ".gitattributes"]);
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

describe("acquisition Git filter boundary", () => {
  it("does not execute repository-configured clean filters or let them hide tracked drift", () => {
    const root = createFilterRepository();
    const marker = join(root, "filter-executed.marker");
    const helper = join(root, "filter-helper.mjs");
    try {
      writeFileSync(
        helper,
        `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "executed\\n");\nprocess.stdout.write("base\\n");\n`,
      );
      runGit(root, ["config", "filter.noema-test-filter.clean", `node ${helper}`]);
      runGit(root, ["config", "filter.noema-test-filter.required", "true"]);
      writeFileSync(join(root, "tracked.txt"), "tampered\n");

      const exactHead = resolveAcquisitionCommit("HEAD", { cwd: root });
      expect(() => verifyAcquisitionTrackedCheckout({
        cwd: root,
        expectedCommitSha: exactHead,
      })).toThrow(`tracked checkout differs from exact HEAD ${exactHead}`);
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
