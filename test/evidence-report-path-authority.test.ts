import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { main as runMaintainerAppReadiness } from "../scripts/maintainer-app-readiness.mjs";
import { main as runProductionEnvironmentGovernanceAudit } from "../scripts/production-environment-governance-audit.mjs";

const temporaryDirectories: string[] = [];
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;

function makeTemporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-evidence-path-authority-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  process.exitCode = originalExitCode;
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("retained acquisition evidence report path authority", () => {
  it("rejects a lexically noncanonical Maintainer App readiness report path", () => {
    const directory = makeTemporaryDirectory();
    const escapedReportPath = join(directory, "escaped-maintainer-readiness.json");
    const reportPath = `${directory}/report-parent/../escaped-maintainer-readiness.json`;

    process.env.GITHUB_REPOSITORY = "invalid-repository-authority";
    process.env.NOEMA_MAINTAINER_READINESS_PATH = reportPath;
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;
    vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => runMaintainerAppReadiness()).toThrow();
    expect(existsSync(escapedReportPath)).toBe(false);
  });

  it("rejects a lexically noncanonical production-environment governance report path", () => {
    const directory = makeTemporaryDirectory();
    const escapedReportPath = join(directory, "escaped-production-governance.json");
    const reportPath = `${directory}/report-parent/../escaped-production-governance.json`;

    expect(() => runProductionEnvironmentGovernanceAudit({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "invalid-repository-authority",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: reportPath,
      },
      log: () => {},
      setExitCode: () => {},
    })).toThrow();
    expect(existsSync(escapedReportPath)).toBe(false);
  });
});
