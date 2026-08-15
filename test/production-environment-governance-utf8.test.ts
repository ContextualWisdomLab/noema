import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGhSubprocessEnvironment,
  decodeGhOutput,
  main,
  redactSensitiveValue,
  runGh,
} from "../scripts/production-environment-governance-audit.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-production-governance-"));
  temporaryDirectories.push(directory);
  return directory;
}

function protectedEnvironment() {
  return {
    id: 12345,
    name: "production",
    html_url: "https://github.com/ContextualWisdomLab/noema/deployments/activity_log?environments_filter=production",
    protection_rules: [
      {
        id: 100,
        type: "required_reviewers",
        prevent_self_review: true,
        reviewers: [
          {
            type: "Team",
            reviewer: {
              id: 2468,
              slug: "production-approvers",
              name: "Production Approvers",
            },
          },
        ],
      },
      { id: 101, type: "branch_policy" },
    ],
    deployment_branch_policy: {
      protected_branches: true,
      custom_branch_policies: false,
    },
  };
}

function failureMessage(action: () => unknown) {
  try {
    action();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("expected action to fail");
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe("production environment governance GitHub CLI UTF-8 boundary", () => {
  it("rejects malformed UTF-8 instead of replacement-decoding production evidence", () => {
    expect(() =>
      decodeGhOutput(Uint8Array.from([0x7b, 0x22, 0xff, 0x22, 0x7d])),
    ).toThrow("GitHub CLI returned invalid UTF-8 in output.");
  });

  it("decodes valid UTF-8 bytes exactly", () => {
    const bytes = new TextEncoder().encode('{"name":"production"}\n');
    expect(decodeGhOutput(bytes, "stdout")).toBe('{"name":"production"}\n');
  });

  it("normalizes an absent diagnostic before redaction", () => {
    expect(redactSensitiveValue(undefined)).toBe("");
  });

  it("executes a successful shell-free bounded request with the least-authority environment", () => {
    let invocation: { command?: string; args?: string[]; options?: Record<string, unknown> } = {};
    const result = runGh(["api", "example"], {
      sourceEnvironment: {},
      spawnSyncImpl: (command, args, options) => {
        invocation = { command, args: args as string[], options: options as Record<string, unknown> };
        return {
          status: 0,
          stdout: Buffer.from("  evidence  \n", "utf8"),
          stderr: Buffer.alloc(0),
          pid: 1,
          output: [],
          signal: null,
        };
      },
    });

    expect(result).toBe("evidence");
    expect(invocation).toMatchObject({
      command: "gh",
      args: ["api", "example"],
      options: {
        env: { GH_HOST: "github.com", NO_COLOR: "1" },
        maxBuffer: 2 * 1024 * 1024,
        shell: false,
      },
    });
    expect(createGhSubprocessEnvironment({ PATH: "", GH_TOKEN: "" })).toEqual({
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("redacts and bounds a subprocess-start failure", () => {
    const token = "read-only-secret-token";
    const message = failureMessage(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { GH_TOKEN: token },
        spawnSyncImpl: () => ({
          status: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
          error: new Error(`${token}${"x".repeat(5_000)}`),
        }),
      }),
    );

    expect(message).toContain("GitHub CLI could not start: [REDACTED]");
    expect(message).not.toContain(token);
    expect(message.endsWith("…")).toBe(true);
  });

  it("prefers stderr and redacts GH_TOKEN on the real runGh failure path", () => {
    const token = "read-only-secret-token";
    const message = failureMessage(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: token },
        spawnSyncImpl: () => ({
          status: 1,
          stdout: Buffer.from(`stdout exposed ${token}`, "utf8"),
          stderr: Buffer.from(`stderr exposed ${token}`, "utf8"),
        }),
      }),
    );

    expect(message).toBe("GitHub CLI failed: stderr exposed [REDACTED]");
    expect(message).not.toContain(token);
    expect(message).not.toContain("stdout exposed");
  });

  it("falls back to stdout and redacts GH_TOKEN when stderr is empty", () => {
    const token = "read-only-secret-token";
    const message = failureMessage(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: token },
        spawnSyncImpl: () => ({
          status: 1,
          stdout: Buffer.from(`stdout exposed ${token}`, "utf8"),
          stderr: Buffer.alloc(0),
        }),
      }),
    );

    expect(message).toBe("GitHub CLI failed: stdout exposed [REDACTED]");
    expect(message).not.toContain(token);
  });

  it("reports the numeric exit status when GitHub CLI emits no diagnostic bytes", () => {
    expect(() =>
      runGh(["api", "example"], {
        sourceEnvironment: {},
        spawnSyncImpl: () => ({ status: 9, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) }),
      }),
    ).toThrow("GitHub CLI failed: exit 9");
  });

  it.each([
    ["stderr", Buffer.from([0xff]), Buffer.from("valid stdout", "utf8")],
    ["stdout", Buffer.alloc(0), Buffer.from([0xff])],
  ] as const)("fails closed on malformed %s bytes from runGh", (label, stderr, stdout) => {
    expect(() =>
      runGh(["api", "example"], {
        sourceEnvironment: { PATH: "/usr/bin:/bin", GH_TOKEN: "secret" },
        spawnSyncImpl: () => ({ status: 1, stdout, stderr }),
      }),
    ).toThrow(`GitHub CLI returned invalid UTF-8 in ${label}.`);
  });
});

describe("production environment governance audit runtime", () => {
  it("writes PASS evidence, outputs, and reviewer summary from an injected read-only response", () => {
    const directory = temporaryDirectory();
    const reportPath = join(directory, "report.json");
    const outputPath = join(directory, "github-output.txt");
    const summaryPath = join(directory, "summary.md");
    const log = vi.fn();
    const setExitCode = vi.fn();
    const environment = protectedEnvironment();

    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: reportPath,
        GITHUB_OUTPUT: outputPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      runGhImpl: (args) => {
        expect(args).toEqual([
          "api",
          "-H",
          "Accept: application/vnd.github+json",
          "-H",
          "X-GitHub-Api-Version: 2026-03-10",
          "repos/ContextualWisdomLab/noema/environments/production",
        ]);
        return JSON.stringify(environment);
      },
      log,
      setExitCode,
    });

    expect(report).toMatchObject({
      repository: "ContextualWisdomLab/noema",
      status: "PASS",
      environment_id: 12345,
      environment_url: environment.html_url,
      reviewer_count: 1,
      failures: [],
    });
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toMatchObject({ status: "PASS" });
    expect(readFileSync(outputPath, "utf8")).toContain("production_environment_governance_status=PASS");
    expect(readFileSync(summaryPath, "utf8")).toContain("### Reviewers");
    expect(readFileSync(summaryPath, "utf8")).toContain("production-approvers");
    expect(log).toHaveBeenCalledOnce();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it("normalizes unsafe environment identity metadata without changing a valid policy result", () => {
    const directory = temporaryDirectory();
    const environment = protectedEnvironment();
    environment.id = Number.MAX_SAFE_INTEGER + 1;
    environment.html_url = `https://example.invalid/${"x".repeat(1_200)}`;

    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl: () => JSON.stringify(environment),
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report.status).toBe("PASS");
    expect(report.environment_id).toBeNull();
    expect(String(report.environment_url)).toHaveLength(1_001);
    expect(String(report.environment_url).endsWith("…")).toBe(true);
  });

  it("uses null for absent environment URL without changing a valid policy result", () => {
    const directory = temporaryDirectory();
    const environment = { ...protectedEnvironment(), html_url: undefined };

    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl: () => JSON.stringify(environment),
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report).toMatchObject({ status: "PASS", environment_url: null });
  });

  it("fails closed for an empty GitHub API response and writes failure summary evidence", () => {
    const directory = temporaryDirectory();
    const reportPath = join(directory, "report.json");
    const summaryPath = join(directory, "summary.md");
    const setExitCode = vi.fn();

    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: reportPath,
        GITHUB_STEP_SUMMARY: summaryPath,
      },
      runGhImpl: () => "",
      log: () => undefined,
      setExitCode,
    });

    expect(report.status).toBe("FAIL");
    expect(report.failures[0]).toMatchObject({
      code: "production_environment_collection_failed",
      detail: "GitHub CLI returned an empty production environment response.",
    });
    expect(readFileSync(summaryPath, "utf8")).toContain("### Failures");
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("fails closed for malformed JSON returned by the GitHub API", () => {
    const directory = temporaryDirectory();
    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl: () => "{not-json",
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report.status).toBe("FAIL");
    expect(report.failures[0].detail).toContain("GitHub CLI returned invalid JSON:");
  });

  it("retains a non-Error JSON parse failure in the collection diagnostic", () => {
    const directory = temporaryDirectory();
    vi.spyOn(JSON, "parse").mockImplementationOnce(() => {
      throw "opaque parse failure";
    });

    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl: () => "{}",
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report).toMatchObject({ status: "FAIL" });
    expect(report.failures[0].detail).toContain("GitHub CLI returned invalid JSON: opaque parse failure");
  });

  it("fails closed before GitHub access for an invalid repository and emits no optional outputs", () => {
    const directory = temporaryDirectory();
    const runGhImpl = vi.fn();
    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "outside/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl,
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report).toMatchObject({ repository: "outside/noema", status: "FAIL" });
    expect(runGhImpl).not.toHaveBeenCalled();
  });

  it("uses nullish ambient defaults when repository and report path are absent", () => {
    const directory = temporaryDirectory();
    const previousDirectory = process.cwd();
    const runGhImpl = vi.fn();
    try {
      process.chdir(directory);
      const report = main({
        sourceEnvironment: {},
        runGhImpl,
        log: () => undefined,
        setExitCode: () => undefined,
      });

      expect(report).toMatchObject({ repository: "unknown", status: "FAIL" });
      expect(runGhImpl).not.toHaveBeenCalled();
      expect(
        JSON.parse(
          readFileSync(
            join(directory, "artifacts/governance/production-environment-governance.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({ repository: "unknown", status: "FAIL" });
    } finally {
      process.chdir(previousDirectory);
    }
  });

  it("uses unknown repository and default relative report path for empty ambient identity", () => {
    const directory = temporaryDirectory();
    const previousDirectory = process.cwd();
    try {
      process.chdir(directory);
      const report = main({
        sourceEnvironment: {
          GITHUB_REPOSITORY: "",
          NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: "   ",
        },
        runGhImpl: () => {
          throw "must not run";
        },
        log: () => undefined,
        setExitCode: () => undefined,
      });

      expect(report).toMatchObject({ repository: "unknown", status: "FAIL" });
      expect(
        JSON.parse(
          readFileSync(
            join(directory, "artifacts/governance/production-environment-governance.json"),
            "utf8",
          ),
        ),
      ).toMatchObject({ repository: "unknown", status: "FAIL" });
    } finally {
      process.chdir(previousDirectory);
    }
  });

  it("retains a non-Error collection failure without inventing a message", () => {
    const directory = temporaryDirectory();
    const report = main({
      sourceEnvironment: {
        GITHUB_REPOSITORY: "ContextualWisdomLab/noema",
        NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH: join(directory, "report.json"),
      },
      runGhImpl: () => {
        throw "opaque collection failure";
      },
      log: () => undefined,
      setExitCode: () => undefined,
    });

    expect(report.failures[0].detail).toBe("opaque collection failure");
  });

  it("does not execute the CLI entrypoint when argv has no script path", async () => {
    const previousArgv = process.argv[1];
    const previousExitCode = process.exitCode;
    try {
      process.argv[1] = "";
      process.exitCode = undefined;
      vi.resetModules();
      const imported = await import("../scripts/production-environment-governance-audit.mjs");

      expect(imported.main).toBeTypeOf("function");
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.argv[1] = previousArgv;
      process.exitCode = previousExitCode;
    }
  });

  it("executes the CLI entrypoint branch fail-closed without network access", async () => {
    const directory = temporaryDirectory();
    const previousArgv = process.argv[1];
    const previousRepository = process.env.GITHUB_REPOSITORY;
    const previousPath = process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH;
    const previousExitCode = process.exitCode;
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      process.argv[1] = resolve("scripts/production-environment-governance-audit.mjs");
      process.env.GITHUB_REPOSITORY = "";
      process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH = join(directory, "entrypoint.json");
      process.exitCode = undefined;
      vi.resetModules();
      await import("../scripts/production-environment-governance-audit.mjs");

      expect(JSON.parse(readFileSync(join(directory, "entrypoint.json"), "utf8"))).toMatchObject({
        repository: "unknown",
        status: "FAIL",
      });
      expect(process.exitCode).toBe(1);
      expect(logSpy).toHaveBeenCalled();
    } finally {
      process.argv[1] = previousArgv;
      if (previousRepository === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = previousRepository;
      if (previousPath === undefined) delete process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH;
      else process.env.NOEMA_PRODUCTION_ENVIRONMENT_GOVERNANCE_PATH = previousPath;
      process.exitCode = previousExitCode;
    }
  });
});
