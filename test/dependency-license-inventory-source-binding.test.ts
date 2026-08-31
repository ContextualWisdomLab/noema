import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const inventoryScript = join(repositoryRoot, "scripts", "dependency-license-inventory.mjs");

function run(cwd: string, command: string, args: string[]) {
  return spawnSync(command, args, { cwd, encoding: "utf8", timeout: 10_000 });
}

function writeLock(path: string, version: string) {
  writeFileSync(
    path,
    `${JSON.stringify({
      name: "dependency-license-source-binding-fixture",
      version,
      lockfileVersion: 3,
      requires: true,
      packages: {
        "": {
          name: "dependency-license-source-binding-fixture",
          version,
        },
      },
    }, null, 2)}\n`,
  );
}

describe("dependency license inventory exact source binding", () => {
  it("rejects lockfile bytes that do not belong to the claimed acquisition commit", () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(), "noema-license-source-binding-")));
    try {
      const lockPath = join(directory, "package-lock.json");
      writeLock(lockPath, "1.0.0");
      expect(run(directory, "git", ["init"]).status).toBe(0);
      expect(run(directory, "git", ["config", "user.email", "fixture@example.invalid"]).status).toBe(0);
      expect(run(directory, "git", ["config", "user.name", "Noema Fixture"]).status).toBe(0);
      expect(run(directory, "git", ["add", "package-lock.json"]).status).toBe(0);
      expect(run(directory, "git", ["commit", "-m", "fixture"]).status).toBe(0);
      const revision = run(directory, "git", ["rev-parse", "HEAD"]);
      expect(revision.status, revision.stderr).toBe(0);
      const exactHead = revision.stdout.trim();

      // Simulate a stage-time writer changing the lockfile while the parent audit
      // still claims the immutable commit resolved at the start of the run.
      writeLock(lockPath, "2.0.0");
      const completed = spawnSync(process.execPath, [inventoryScript], {
        cwd: directory,
        encoding: "utf8",
        timeout: 10_000,
        env: {
          ...process.env,
          NOEMA_DATA_ROOM_SOURCE_COMMIT: exactHead,
        },
      });

      expect(completed.status).toBe(1);
      expect(completed.stderr).toContain("claimed acquisition commit");
      const outputPath = join(directory, "artifacts", "release", "dependency-licenses.json");
      expect(existsSync(outputPath)).toBe(false);
      expect(readFileSync(lockPath, "utf8")).toContain('"version": "2.0.0"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
