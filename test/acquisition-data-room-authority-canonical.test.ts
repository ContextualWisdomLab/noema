import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const manifestEntrypoint = fileURLToPath(new URL("../scripts/acquisition-data-room-manifest.mjs", import.meta.url));
const integrityEntrypoint = fileURLToPath(new URL("../scripts/acquisition-data-room-integrity-audit.mjs", import.meta.url));
const entrypoints = [
  ["manifest", manifestEntrypoint],
  ["integrity", integrityEntrypoint],
] as const;

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function cleanTrackedRepository() {
  const root = mkdtempSync(join(tmpdir(), "noema-data-room-authority-"));
  writeFileSync(join(root, "README.md"), "committed evidence\n");
  runGit(root, ["init", "--quiet"]);
  runGit(root, ["add", "README.md"]);
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
  runGit(root, ["tag", "v1.2.3"]);
  return { root, head: runGit(root, ["rev-parse", "HEAD"]) };
}

function runEntrypoint(
  entrypoint: string,
  root: string,
  overrides: Record<string, string>,
) {
  const outputDirectory = join(root, "artifacts");
  return spawnSync(process.execPath, [entrypoint], {
    cwd: root,
    env: {
      ...process.env,
      NOEMA_DATA_ROOM_OUTPUT_DIR: outputDirectory,
      NOEMA_ACQUISITION_AUDIT_OUTPUT_DIR: outputDirectory,
      NOEMA_DATA_ROOM_MANIFEST_PATH: join(outputDirectory, "data-room-manifest.json"),
      NOEMA_DATA_ROOM_SOURCE_COMMIT: "",
      NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "",
      ...overrides,
    },
    encoding: "utf8",
    timeout: 30_000,
  });
}

function combinedOutput(result: ReturnType<typeof spawnSync>) {
  return `${String(result.stdout || "")}\n${String(result.stderr || "")}`;
}

describe("acquisition data-room authority canonicalization", () => {
  it.each(entrypoints)("rejects surrounding whitespace around the exact source commit in %s", (_label, entrypoint) => {
    const { root, head } = cleanTrackedRepository();
    try {
      const result = runEntrypoint(entrypoint, root, {
        NOEMA_DATA_ROOM_SOURCE_COMMIT: ` ${head}\t`,
      });
      expect(result.status).not.toBe(0);
      expect(combinedOutput(result)).toContain(
        "NOEMA_DATA_ROOM_SOURCE_COMMIT must be an exact lowercase full commit SHA.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(entrypoints)("rejects uppercase full-SHA source authority in %s", (_label, entrypoint) => {
    const { root } = cleanTrackedRepository();
    try {
      const result = runEntrypoint(entrypoint, root, {
        NOEMA_DATA_ROOM_SOURCE_COMMIT: "A".repeat(40),
      });
      expect(result.status).not.toBe(0);
      expect(combinedOutput(result)).toContain(
        "NOEMA_DATA_ROOM_SOURCE_COMMIT must be an exact lowercase full commit SHA.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(entrypoints)("rejects surrounding whitespace around the release tag in %s", (_label, entrypoint) => {
    const { root } = cleanTrackedRepository();
    try {
      const result = runEntrypoint(entrypoint, root, {
        NOEMA_RELEASE_UNDER_DILIGENCE_TAG: " v1.2.3\n",
      });
      expect(result.status).not.toBe(0);
      expect(combinedOutput(result)).toContain(
        "NOEMA_RELEASE_UNDER_DILIGENCE_TAG must use exact canonical SemVer bytes.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(entrypoints)("rejects leading-zero SemVer core authority in %s", (_label, entrypoint) => {
    const { root } = cleanTrackedRepository();
    try {
      const result = runEntrypoint(entrypoint, root, {
        NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "v01.2.3",
      });
      expect(result.status).not.toBe(0);
      expect(combinedOutput(result)).toContain(
        "NOEMA_RELEASE_UNDER_DILIGENCE_TAG must use exact canonical SemVer bytes.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(entrypoints)("rejects leading-zero numeric prerelease authority in %s", (_label, entrypoint) => {
    const { root } = cleanTrackedRepository();
    try {
      const result = runEntrypoint(entrypoint, root, {
        NOEMA_RELEASE_UNDER_DILIGENCE_TAG: "v1.2.3-01",
      });
      expect(result.status).not.toBe(0);
      expect(combinedOutput(result)).toContain(
        "NOEMA_RELEASE_UNDER_DILIGENCE_TAG must use exact canonical SemVer bytes.",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
