import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifestEntrypoint = fileURLToPath(new URL("../scripts/acquisition-data-room-manifest.mjs", import.meta.url));
const integrityEntrypoint = fileURLToPath(new URL("../scripts/acquisition-data-room-integrity-audit.mjs", import.meta.url));

/** Create a local-only Git fixture whose tracked worktree differs from its exact HEAD. */
function dirtyTrackedRepository() {
  const root = mkdtempSync(join(tmpdir(), "noema-data-room-git-binding-"));
  writeFileSync(join(root, "README.md"), "committed evidence\n");
  const commands = [
    ["init", "--quiet"],
    ["add", "README.md"],
    ["-c", "user.name=Noema Tests", "-c", "user.email=noema-tests@example.invalid", "commit", "--quiet", "-m", "fixture"],
  ];
  for (const args of commands) {
    const result = spawnSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000,
    });
    if (result.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`failed to create local Git fixture: ${result.stderr}`);
    }
  }
  writeFileSync(join(root, "README.md"), "mutated tracked evidence\n");
  return root;
}

function runEntrypoint(entrypoint: string, root: string, outputDirectory: string) {
  return spawnSync(process.execPath, [entrypoint], {
    cwd: root,
    env: {
      ...process.env,
      NOEMA_DATA_ROOM_OUTPUT_DIR: outputDirectory,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDirectory,
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(outputDirectory, "data-room-manifest.json"),
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

describe("acquisition entrypoint exact-Git binding", () => {
  it("refuses manifest generation when tracked bytes drift while HEAD remains fixed", () => {
    const root = dirtyTrackedRepository();
    try {
      const result = runEntrypoint(manifestEntrypoint, root, join(root, "artifacts"));
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("tracked checkout differs from exact HEAD");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("refuses integrity authorization when tracked bytes drift while HEAD remains fixed", () => {
    const root = dirtyTrackedRepository();
    try {
      const result = runEntrypoint(integrityEntrypoint, root, join(root, "artifacts"));
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}\n${result.stderr}`).toContain("tracked checkout differs from exact HEAD");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
