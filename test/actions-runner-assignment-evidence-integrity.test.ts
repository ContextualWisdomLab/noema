import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { runActionsRunnerAssignmentAudit } from "../scripts/actions-runner-assignment-audit.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";
const directories: string[] = [];

function auditEnvironment(): Record<string, string> {
  return {
    GH_TOKEN: "present-but-never-retained",
    NOEMA_ACTIONS_AUDIT_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_ACTIONS_AUDIT_HEAD_SHA: expectedHead,
    NOEMA_ACTIONS_AUDIT_RUN_IDS: "100",
  };
}

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-runner-evidence-integrity-"));
  directories.push(directory);
  return directory;
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("runner-assignment evidence integrity", () => {
  it.each([
    "2026-02-30T00:00:00.000Z",
    "2026-08-10T00:00:00+00:00",
    "2026-08-10T00:00:00.000+00:00",
  ])("rejects non-canonical observed_at evidence before GitHub access: %s", async (observedAt) => {
    const ghApiReader = vi.fn();
    const writer = vi.fn();

    await expect(runActionsRunnerAssignmentAudit({
      env: auditEnvironment(),
      observed_at: observedAt,
      gh_api: ghApiReader,
      write_report: writer,
    })).rejects.toThrow(/observed_at.*canonical|canonical.*observed_at/i);

    expect(ghApiReader).not.toHaveBeenCalled();
    expect(writer).not.toHaveBeenCalled();
  });

  it("refuses a symbolic-link report parent instead of writing evidence through it", () => {
    const directory = temporaryDirectory();
    const realParent = join(directory, "real-parent");
    const artifactsPath = join(directory, "artifacts");
    mkdirSync(realParent);
    symlinkSync(realParent, artifactsPath, "dir");

    const moduleUrl = pathToFileURL(resolve("scripts/actions-runner-assignment-audit.mjs")).href;
    const child = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { writeReportAtomically } from ${JSON.stringify(moduleUrl)}; writeReportAtomically({status: "PASS"});`,
      ],
      {
        cwd: directory,
        encoding: "utf8",
      },
    );

    expect(child.status).not.toBe(0);
    expect(`${child.stderr}\n${child.stdout}`).toMatch(/output parent|symbolic link|real directory/i);
    expect(existsSync(join(realParent, "operations", "actions-runner-assignment-audit.json"))).toBe(false);
  });
});
