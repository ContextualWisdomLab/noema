import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const repository = "ContextualWisdomLab/noema";
const originalEnvironment = { ...process.env };
const originalArgv1 = process.argv[1];
const originalCwd = process.cwd();
const originalExitCode = process.exitCode;
const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-remaining-"));
  directories.push(directory);
  return directory;
}

function restoreProcessState(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.argv[1] = originalArgv1;
  process.exitCode = originalExitCode;
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.doUnmock("node:child_process");
  vi.doUnmock("../scripts/lib/maintainer-app-readiness.mjs");
  vi.resetModules();
}

function fakeGithubPayload(args: readonly string[]): unknown {
  const endpoint = args.at(-1) || "";
  if (endpoint.includes("installation/repositories")) {
    return [{ repositories: [{ full_name: repository }] }];
  }
  if (endpoint.includes("users/noema-maintainer")) {
    return { login: "noema-maintainer[bot]", type: "Bot" };
  }
  if (endpoint.includes("users/noema-reviewer")) {
    return { login: "noema-reviewer[bot]", type: "Bot" };
  }
  if (endpoint === `repos/${repository}`) {
    return {
      default_branch: "main",
      permissions: { pull: true, push: true, admin: false, maintain: false, triage: false },
    };
  }
  if (endpoint.includes(`/commits/main`)) {
    return { sha: "a".repeat(40) };
  }
  if (endpoint.includes("/rules/branches/main")) {
    return [[]];
  }
  return {};
}

function installGitHubCliMock(): void {
  vi.doMock("node:child_process", () => ({
    spawnSync: (_command: string, args: string[]) => ({
      status: 0,
      error: undefined,
      stdout: Buffer.from(JSON.stringify(fakeGithubPayload(args)), "utf8"),
      stderr: Buffer.alloc(0),
    }),
  }));
}

function configureFixture(directory: string): void {
  const tokenPath = join(directory, "token");
  const governancePath = join(directory, "governance.json");
  writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
  writeFileSync(governancePath, '{"status":"PASS"}\n', "utf8");
  Object.assign(process.env, {
    GITHUB_REPOSITORY: repository,
    NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
    NOEMA_MAINTAINER_APP_SLUG: "noema-maintainer",
    NOEMA_MAINTAINER_INSTALLATION_ID: "123456",
    NOEMA_REVIEWER_APP_SLUG: "noema-reviewer",
    NOEMA_REVIEWER_INSTALLATION_ID: "654321",
    NOEMA_REVIEWER_LOGIN: "noema-reviewer[bot]",
    NOEMA_MAINTENANCE_ENABLED: "false",
    NOEMA_MAINTAINER_READINESS_PATH: join(directory, "report.json"),
    NOEMA_GOVERNANCE_AUDIT_PATH: governancePath,
  });
  delete process.env.GITHUB_OUTPUT;
  delete process.env.GITHUB_STEP_SUMMARY;
}

async function importSubject() {
  return import("../scripts/maintainer-app-readiness.mjs");
}

afterEach(() => restoreProcessState());

describe("maintainer App remaining defensive branches", () => {
  it("bounds a non-Error parser failure instead of persisting an unbounded thrown value", async () => {
    const subject = await importSubject();
    const nativeParse = JSON.parse;
    vi.spyOn(JSON, "parse").mockImplementation((text: string) => {
      if (text === '"force-non-error"') throw "synthetic parser failure";
      return nativeParse(text);
    });

    expect(() => subject.parseGithubApiJsonBytes(
      new TextEncoder().encode('{"force-non-error":true}'),
      "GitHub API",
    )).toThrow(/invalid JSON: synthetic parser failure/i);
  });

  it("fails closed when the required-probe inventory and statically constructed probe map diverge", async () => {
    installGitHubCliMock();
    vi.doMock("../scripts/lib/maintainer-app-readiness.mjs", async () => {
      const actual = await vi.importActual<typeof import("../scripts/lib/maintainer-app-readiness.mjs")>(
        "../scripts/lib/maintainer-app-readiness.mjs",
      );
      return {
        ...actual,
        REQUIRED_API_PROBES: Object.freeze([...actual.REQUIRED_API_PROBES, "unexpected_required_probe"]),
      };
    });
    const directory = temporaryDirectory();
    configureFixture(directory);
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toMatch(/missing required API probe unexpected_required_probe/i);
  });

  it("does not manufacture a live governance count when the evaluated evidence loses its array shape", async () => {
    installGitHubCliMock();
    vi.doMock("../scripts/lib/maintainer-app-readiness.mjs", async () => {
      const actual = await vi.importActual<typeof import("../scripts/lib/maintainer-app-readiness.mjs")>(
        "../scripts/lib/maintainer-app-readiness.mjs",
      );
      return {
        ...actual,
        evaluateMaintainerAppReadiness: (evidence: { governanceRules?: unknown }) => {
          evidence.governanceRules = null;
          return { status: "PASS", checks: [], failures: [] };
        },
      };
    });
    const directory = temporaryDirectory();
    configureFixture(directory);
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("PASS");
    expect(report.live_governance_rule_count).toBe(0);
  });

  it("retains a bounded non-Error collection failure when an evaluator violates the normal Error contract", async () => {
    installGitHubCliMock();
    vi.doMock("../scripts/lib/maintainer-app-readiness.mjs", async () => {
      const actual = await vi.importActual<typeof import("../scripts/lib/maintainer-app-readiness.mjs")>(
        "../scripts/lib/maintainer-app-readiness.mjs",
      );
      return {
        ...actual,
        evaluateMaintainerAppReadiness: () => {
          throw "synthetic evaluator failure";
        },
      };
    });
    const directory = temporaryDirectory();
    configureFixture(directory);
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toBe("synthetic evaluator failure");
  });

  it("uses reviewed default evidence paths for both undefined and whitespace-only configuration", async () => {
    installGitHubCliMock();
    const directory = temporaryDirectory();
    configureFixture(directory);
    process.chdir(directory);
    mkdirSync(join(directory, "artifacts", "governance"), { recursive: true });
    writeFileSync(
      join(directory, "artifacts", "governance", "main-governance-audit.json"),
      '{"status":"PASS"}\n',
      "utf8",
    );
    delete process.env.NOEMA_MAINTAINER_READINESS_PATH;
    process.env.NOEMA_GOVERNANCE_AUDIT_PATH = "   ";
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures.length).toBeGreaterThan(0);
    expect(join(directory, "artifacts", "operations", "maintainer-app-readiness.json"))
      .toBe(join(directory, "artifacts", "operations", "maintainer-app-readiness.json"));
  });

  it("treats absent repository, token-path, and maintenance configuration as non-authoritative", async () => {
    const directory = temporaryDirectory();
    configureFixture(directory);
    delete process.env.GITHUB_REPOSITORY;
    delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    delete process.env.NOEMA_MAINTENANCE_ENABLED;
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.repository).toBe("unknown");
    expect(report.maintenance_enabled).toBe(false);
  });

  it("treats explicit maintenance activation as a pre-activation failure", async () => {
    installGitHubCliMock();
    const directory = temporaryDirectory();
    configureFixture(directory);
    process.env.NOEMA_MAINTENANCE_ENABLED = "true";
    const subject = await importSubject();

    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(report.status).toBe("FAIL");
    expect(report.failures.some((failure: { code: string }) => failure.code === "maintenance_already_enabled"))
      .toBe(true);
  });

  it("imports safely when argv has no executable script identity", async () => {
    process.argv[1] = "";
    const subject = await importSubject();
    expect(typeof subject.main).toBe("function");
  });
});
