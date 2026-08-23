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
import { afterAll, describe, expect, it } from "vitest";
import { main } from "../scripts/production-environment-governance-audit.mjs";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-production-output-safety-"));
  directories.push(directory);
  return directory;
}

function failureEnvironment(reportPath: string): NodeJS.ProcessEnv {
  return {
    GITHUB_REPOSITORY: "outside-scope/repository",
    NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: reportPath,
  };
}

function runFailure(reportPath: string): void {
  main({
    sourceEnvironment: failureEnvironment(reportPath),
    runGhImpl: () => {
      throw new Error("GitHub collection must not be reached for invalid repository scope.");
    },
    log: () => {},
    setExitCode: () => {},
  });
}

afterAll(() => {
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("production environment governance output path integrity", () => {
  it("refuses a pre-existing symbolic-link report leaf without modifying its target", () => {
    const directory = temporaryDirectory();
    const targetPath = join(directory, "target.json");
    const reportPath = join(directory, "report.json");
    writeFileSync(targetPath, "sentinel\n", "utf8");
    symlinkSync(targetPath, reportPath);

    expect(() => runFailure(reportPath)).toThrow(/output path|symbolic link|regular file/i);
    expect(readFileSync(targetPath, "utf8")).toBe("sentinel\n");
  });

  it("refuses a symbolic-link report parent without creating evidence through it", () => {
    const directory = temporaryDirectory();
    const realParent = join(directory, "real-parent");
    const linkedParent = join(directory, "linked-parent");
    const reportPath = join(linkedParent, "report.json");
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, "dir");

    expect(() => runFailure(reportPath)).toThrow(/output parent|symbolic link|real directory/i);
    expect(existsSync(join(realParent, "report.json"))).toBe(false);
  });
});
