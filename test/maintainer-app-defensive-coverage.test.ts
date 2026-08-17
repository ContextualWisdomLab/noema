import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { main } from "../scripts/maintainer-app-readiness.mjs";

const repository = "ContextualWisdomLab/noema";
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;
const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-defensive-"));
  directories.push(directory);
  return directory;
}

function restoreProcessState(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.exitCode = originalExitCode;
}

function configureEarlyFailure(directory: string): {
  reportPath: string;
  summaryPath: string;
} {
  const tokenPath = join(directory, "token");
  const reportPath = join(directory, "report.json");
  const summaryPath = join(directory, "summary.md");
  writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repository,
    NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
    NOEMA_MAINTAINER_APP_SLUG: "noema-maintainer",
    NOEMA_MAINTAINER_INSTALLATION_ID: "123456",
    NOEMA_REVIEWER_APP_SLUG: "noema-reviewer",
    NOEMA_REVIEWER_INSTALLATION_ID: "654321",
    NOEMA_REVIEWER_LOGIN: "noema-reviewer[bot]",
    NOEMA_MAINTENANCE_ENABLED: "false",
    NOEMA_MAINTAINER_READINESS_PATH: reportPath,
    NOEMA_GOVERNANCE_AUDIT_PATH: join(directory, "governance.json"),
    GITHUB_STEP_SUMMARY: summaryPath,
  });
  delete process.env.GITHUB_OUTPUT;
  return { reportPath, summaryPath };
}

function configureMissingDefaultBranch(directory: string): string {
  const binDirectory = join(directory, "bin");
  const ghPath = join(binDirectory, "gh");
  const tokenPath = join(directory, "token");
  const governancePath = join(directory, "governance.json");
  const reportPath = join(directory, "report.json");
  mkdirSync(binDirectory, { recursive: true });
  writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
  writeFileSync(governancePath, '{"repository":"ContextualWisdomLab/noema","branch":"main","status":"PASS"}\n', "utf8");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const endpoint = process.argv.at(-1) || "";
let payload = {};
if (endpoint.includes("installation/repositories")) {
  payload = [{ repositories: [{ full_name: "${repository}" }] }];
} else if (endpoint.includes("users/noema-maintainer")) {
  payload = { login: "noema-maintainer[bot]", type: "Bot" };
} else if (endpoint.includes("users/noema-reviewer")) {
  payload = { login: "noema-reviewer[bot]", type: "Bot" };
} else if (endpoint === "repos/${repository}") {
  payload = { permissions: { pull: true, push: true, admin: false, maintain: false, triage: false } };
}
process.stdout.write(JSON.stringify(payload));
`,
    "utf8",
  );
  chmodSync(ghPath, 0o755);
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repository,
    NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
    NOEMA_MAINTAINER_APP_SLUG: "noema-maintainer",
    NOEMA_MAINTAINER_INSTALLATION_ID: "123456",
    NOEMA_REVIEWER_APP_SLUG: "noema-reviewer",
    NOEMA_REVIEWER_INSTALLATION_ID: "654321",
    NOEMA_REVIEWER_LOGIN: "noema-reviewer[bot]",
    NOEMA_MAINTENANCE_ENABLED: "false",
    NOEMA_MAINTAINER_READINESS_PATH: reportPath,
    NOEMA_GOVERNANCE_AUDIT_PATH: governancePath,
    PATH: `${binDirectory}:${originalEnvironment.PATH || ""}`,
  });
  delete process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_STEP_SUMMARY;
  return reportPath;
}

afterEach(() => restoreProcessState());

afterAll(() => {
  restoreProcessState();
  for (const directory of directories) rmSync(directory, { recursive: true, force: true });
});

describe("maintainer App realistic missing-evidence coverage", () => {
  it("reports missing reviewer identity as unknown without manufacturing readiness", () => {
    const directory = temporaryDirectory();
    const { reportPath, summaryPath } = configureEarlyFailure(directory);
    delete process.env.NOEMA_REVIEWER_APP_SLUG;
    delete process.env.NOEMA_REVIEWER_LOGIN;
    delete process.env.NOEMA_MAINTENANCE_ENABLED;

    const previousExitCode = process.exitCode;
    const report = main();
    process.exitCode = previousExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.reviewer_app_slug).toBe("");
    expect(report.reviewer_login).toBe("");
    expect(report.maintenance_enabled).toBe(false);
    expect(JSON.parse(readFileSync(reportPath, "utf8")).status).toBe("FAIL");
    const summary = readFileSync(summaryPath, "utf8");
    expect(summary).toContain("Reviewer App: `unknown`");
    expect(summary).toContain("Reviewer bot: `unknown`");
  });

  it("treats an absent installation id as invalid rather than coercing authority", () => {
    const directory = temporaryDirectory();
    configureEarlyFailure(directory);
    delete process.env.NOEMA_MAINTAINER_INSTALLATION_ID;

    const previousExitCode = process.exitCode;
    const report = main();
    process.exitCode = previousExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/positive integer/i);
  });

  it("fails closed when repository metadata omits the default branch", () => {
    const directory = temporaryDirectory();
    configureMissingDefaultBranch(directory);

    const previousExitCode = process.exitCode;
    const report = main();
    process.exitCode = previousExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/received missing/i);
  });
});
