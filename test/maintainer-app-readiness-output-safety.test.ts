import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { main } from "../scripts/maintainer-app-readiness.mjs";

const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;
const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-output-safety-"));
  directories.push(directory);
  return directory;
}

function configureCollectionFailure(reportPath: string): void {
  process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/not-noema";
  process.env.NOEMA_MAINTAINER_READINESS_PATH = reportPath;
  delete process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_STEP_SUMMARY;
}

function restoreProcessState(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.exitCode = originalExitCode;
}

afterEach(() => restoreProcessState());

afterAll(() => {
  restoreProcessState();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("maintainer App readiness output path integrity", () => {
  it("refuses a pre-existing symbolic-link report leaf without modifying its target", () => {
    const directory = temporaryDirectory();
    const targetPath = join(directory, "target.json");
    const reportPath = join(directory, "report.json");
    writeFileSync(targetPath, "sentinel\n", "utf8");
    symlinkSync(targetPath, reportPath);
    configureCollectionFailure(reportPath);

    expect(() => main()).toThrow(/output path|symbolic link|regular file/i);
    expect(readFileSync(targetPath, "utf8")).toBe("sentinel\n");
  });

  it("refuses a symbolic-link report parent without creating evidence through it", () => {
    const directory = temporaryDirectory();
    const realParent = join(directory, "real-parent");
    const linkedParent = join(directory, "linked-parent");
    const reportPath = join(linkedParent, "report.json");
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, "dir");
    configureCollectionFailure(reportPath);

    expect(() => main()).toThrow(/output parent|symbolic link|real directory/i);
    expect(existsSync(join(realParent, "report.json"))).toBe(false);
  });
});
