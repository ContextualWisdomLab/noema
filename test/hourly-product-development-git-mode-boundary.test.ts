import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/hourly-product-development.yml";
const temporaryRepositories: string[] = [];

const rawModeGate = `git diff --cached --raw | awk '
            /^:/ {
              old_mode = substr($1, 2)
              new_mode = $2
              if (old_mode ~ /^(120000|160000)$/ || new_mode ~ /^(120000|160000)$/) {
                found = 1
              }
            }
            END { exit(found ? 0 : 1) }
          '`;

type GitObjectMode = "regular" | "symlink" | "gitlink";

/** Run one Git command in the isolated fixture repository and return trimmed output. */
function runGit(repository: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repository,
    encoding: "utf8",
  }).trim();
}

/** Stage one regular file, symbolic link, or gitlink at the shared fixture path. */
function stageObject(repository: string, mode: GitObjectMode): void {
  const itemPath = join(repository, "item");
  rmSync(itemPath, { force: true, recursive: true });

  if (mode === "regular") {
    writeFileSync(itemPath, "bounded content\n", "utf8");
    runGit(repository, ["add", "item"]);
    return;
  }
  if (mode === "symlink") {
    symlinkSync("bounded-target", itemPath);
    runGit(repository, ["add", "item"]);
    return;
  }

  const targetCommit = runGit(repository, ["rev-parse", "HEAD"]);
  runGit(repository, [
    "update-index",
    "--add",
    "--cacheinfo",
    `160000,${targetCommit},item`,
  ]);
}

/** Create a committed temporary repository whose item begins in the requested mode. */
function createRepository(initialMode: GitObjectMode): string {
  const repository = mkdtempSync(join(tmpdir(), "noema-git-mode-boundary-"));
  temporaryRepositories.push(repository);
  runGit(repository, ["init", "-q"]);
  runGit(repository, ["config", "user.email", "test@example.invalid"]);
  runGit(repository, ["config", "user.name", "Noema Boundary Test"]);
  writeFileSync(join(repository, "seed"), "seed\n", "utf8");
  runGit(repository, ["add", "seed"]);
  runGit(repository, ["commit", "-qm", "seed"]);
  stageObject(repository, initialMode);
  runGit(repository, ["commit", "-qm", `baseline ${initialMode}`]);
  return repository;
}

/** Replace the committed item with another staged Git object mode. */
function replaceStagedObject(repository: string, mode: GitObjectMode): void {
  const itemPath = join(repository, "item");
  try {
    unlinkSync(itemPath);
  } catch (error) {
    const code = error instanceof Error && "code" in error
      ? String(error.code)
      : "";
    if (code !== "ENOENT") throw error;
  }
  stageObject(repository, mode);
}

/** Execute the production AWK gate unchanged and report whether it rejects the diff. */
function modeGateRejects(repository: string): boolean {
  const result = spawnSync("bash", ["-c", rawModeGate], {
    cwd: repository,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result.status === 0;
}

describe("hourly product-development Git object boundary", () => {
  afterEach(() => {
    for (const repository of temporaryRepositories.splice(0)) {
      rmSync(repository, { recursive: true, force: true });
    }
  });

  it("checks both source and target modes for symlinks and gitlinks at every boundary", () => {
    const workflow = readFileSync(workflowPath, "utf8");

    expect(workflow.match(/git diff --cached --raw/g)).toHaveLength(3);
    expect(workflow.split(rawModeGate)).toHaveLength(4);
    expect(workflow).not.toContain("git diff --cached --summary");
    expect(workflow.match(/symlink or gitlink/g)).toHaveLength(3);
  });

  it.each([
    { from: "regular", to: "symlink", boundary: "new 120000 mode" },
    { from: "symlink", to: "regular", boundary: "old 120000 mode" },
    { from: "regular", to: "gitlink", boundary: "new 160000 mode" },
    { from: "gitlink", to: "regular", boundary: "old 160000 mode" },
  ] as const)(
    "rejects $from to $to staged transitions through the $boundary",
    ({ from, to }) => {
      const repository = createRepository(from);
      replaceStagedObject(repository, to);

      expect(runGit(repository, ["diff", "--cached", "--raw"])).toMatch(
        /(?:120000|160000)/,
      );
      expect(modeGateRejects(repository)).toBe(true);
    },
  );
});
