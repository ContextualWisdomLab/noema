import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const cliUrl = new URL(
  "../scripts/external-scheduler-evidence-audit.mjs",
  import.meta.url,
);
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-scheduler-audit-"));
  temporaryDirectories.push(directory);
  return directory;
}

async function loadCli() {
  return await import(cliUrl.href) as Record<string, any>;
}

function passingEvidence() {
  return {
    schema_version: 1,
    scheduler_task_identity: "chatgpt-task:noema-hourly-primary",
    prompt_sha256: "a".repeat(64),
    scheduled_at: "2026-08-10T11:00:00.000Z",
    started_at: "2026-08-10T11:00:05.000Z",
    repository_full_name: repository,
    protected_main_sha: "b".repeat(40),
    generic_error_observed: false,
    safe_independent_lane_count: 1,
    github_actions_performed: [
      {
        action_identity: "issue:96",
        action_kind: "issue_created",
        target_repository: repository,
        target_ref: "issues/96",
      },
    ],
    deferred_lanes: [],
    termination_reason: "double_exit_sweep",
    exit_sweep_count: 2,
    remaining_non_actionable_reasons: ["independent_approval_unavailable"],
  };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("external scheduler evidence CLI", () => {
  it("exports bounded, testable operator seams", async () => {
    const cli = await loadCli();

    for (const exportName of [
      "sanitizeReportText",
      "resolveNoFollowFlag",
      "readExternalSchedulerEvidence",
      "writeAtomicJson",
      "resolveCliPaths",
      "createFailureReport",
      "createValidationReport",
      "main",
      "runIfDirect",
    ]) {
      expect(typeof cli[exportName], exportName).toBe("function");
    }
  });

  it("normalizes platform no-follow support without weakening a present flag", async () => {
    const cli = await loadCli();

    expect(cli.resolveNoFollowFlag(131072)).toBe(131072);
    expect(cli.resolveNoFollowFlag(undefined)).toBe(0);
  });

  it("bounds report text for strings, errors, absent values, controls, and long input", async () => {
    const cli = await loadCli();

    expect(cli.sanitizeReportText("  safe\nvalue  ")).toBe("safevalue");
    expect(cli.sanitizeReportText(new Error("operator failure"))).toBe("operator failure");
    expect(cli.sanitizeReportText(undefined)).toBe("");
    const longText = cli.sanitizeReportText("x".repeat(900));
    expect(longText).toHaveLength(800);
    expect(longText.endsWith("…")).toBe(true);
  });

  it("reads one regular bounded UTF-8 JSON evidence file", async () => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "evidence.json");
    const evidence = passingEvidence();
    writeFileSync(evidencePath, `${JSON.stringify(evidence)}\n`, "utf8");

    expect(cli.readExternalSchedulerEvidence(evidencePath)).toEqual(evidence);
  });

  it("closes an opened descriptor when evidence changes between metadata and read", async () => {
    const cli = await loadCli();
    const closed: number[] = [];
    const io = {
      openSync: () => 17,
      fstatSync: () => ({ isFile: () => true, size: 3 }),
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(() => cli.readExternalSchedulerEvidence("ignored.json", io)).toThrow(
      "changed while it was being read",
    );
    expect(closed).toEqual([17]);
  });

  it("does not close a descriptor that was never opened", async () => {
    const cli = await loadCli();
    const closed: number[] = [];
    const io = {
      openSync: () => {
        throw new Error("open failed");
      },
      fstatSync: () => {
        throw new Error("must not inspect");
      },
      readFileSync: () => {
        throw new Error("must not read");
      },
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(() => cli.readExternalSchedulerEvidence("ignored.json", io)).toThrow(
      "open failed",
    );
    expect(closed).toEqual([]);
  });

  it("rejects a non-regular evidence object", async () => {
    const cli = await loadCli();
    const closed: number[] = [];
    const io = {
      openSync: () => 23,
      fstatSync: () => ({ isFile: () => false, size: 12 }),
      readFileSync: () => Buffer.from("{}", "utf8"),
      closeSync: (descriptor: number) => closed.push(descriptor),
    };

    expect(() => cli.readExternalSchedulerEvidence("ignored.json", io)).toThrow(
      "regular file",
    );
    expect(closed).toEqual([23]);
  });

  it.each([
    ["empty", Buffer.alloc(0)],
    ["oversized", Buffer.alloc(262_145, 0x20)],
  ])("rejects %s evidence", async (_label, bytes) => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "evidence.json");
    writeFileSync(evidencePath, bytes);

    expect(() => cli.readExternalSchedulerEvidence(evidencePath)).toThrow(
      "1 through 262144 bytes",
    );
  });

  it("rejects malformed UTF-8 before JSON parsing", async () => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "evidence.json");
    writeFileSync(evidencePath, Buffer.from([0xc3, 0x28]));

    expect(() => cli.readExternalSchedulerEvidence(evidencePath)).toThrow();
  });

  it("rejects malformed JSON", async () => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "evidence.json");
    writeFileSync(evidencePath, "{", "utf8");

    expect(() => cli.readExternalSchedulerEvidence(evidencePath)).toThrow();
  });

  it("does not follow the final evidence symlink", async () => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const targetPath = join(directory, "target.json");
    const linkPath = join(directory, "evidence.json");
    writeFileSync(targetPath, JSON.stringify(passingEvidence()), "utf8");
    symlinkSync(targetPath, linkPath);

    expect(() => cli.readExternalSchedulerEvidence(linkPath)).toThrow();
  });

  it("writes a private atomic JSON report and removes its temporary directory", async () => {
    const cli = await loadCli();
    const directory = temporaryDirectory();
    const reportPath = join(directory, "nested", "report.json");

    expect(cli.writeAtomicJson(reportPath, { status: "PASS" })).toBe(
      resolve(reportPath),
    );
    expect(JSON.parse(readFileSync(reportPath, "utf8"))).toEqual({ status: "PASS" });
    expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    expect(
      readdirSync(dirname(reportPath)).filter((name) => name.startsWith(".scheduler-audit-")),
    ).toEqual([]);
  });

  it("removes its private temporary directory when atomic publication fails", async () => {
    const cli = await loadCli();
    const removed: Array<{ path: string; options: unknown }> = [];
    const directory = temporaryDirectory();
    const io = {
      mkdirSync: () => undefined,
      mkdtempSync: () => join(directory, ".scheduler-audit-fixed"),
      writeFileSync: () => undefined,
      renameSync: () => {
        throw new Error("rename failed");
      },
      rmSync: (path: string, options: unknown) => removed.push({ path, options }),
    };

    expect(() => cli.writeAtomicJson(join(directory, "report.json"), {}, io)).toThrow(
      "rename failed",
    );
    expect(removed).toEqual([
      {
        path: join(directory, ".scheduler-audit-fixed"),
        options: { recursive: true, force: true },
      },
    ]);
  });

  it("resolves environment, argument, default, and blank CLI paths deterministically", async () => {
    const cli = await loadCli();

    expect(cli.resolveCliPaths(
      {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: " /env/evidence.json ",
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: " /env/report.json ",
      },
      ["node", "script", "/arg/evidence.json"],
    )).toEqual({
      evidencePath: "/env/evidence.json",
      reportPath: "/env/report.json",
    });
    expect(cli.resolveCliPaths({}, ["node", "script", "/arg/evidence.json"])).toEqual({
      evidencePath: "/arg/evidence.json",
      reportPath: "artifacts/operations/external-scheduler-evidence-audit.json",
    });
    expect(cli.resolveCliPaths({}, ["node", "script"])).toEqual({
      evidencePath: "external-scheduler-evidence.json",
      reportPath: "artifacts/operations/external-scheduler-evidence-audit.json",
    });
    expect(cli.resolveCliPaths(
      {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: "   ",
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: "   ",
      },
      ["node", "script", "/ignored/evidence.json"],
    )).toEqual({
      evidencePath: "external-scheduler-evidence.json",
      reportPath: "artifacts/operations/external-scheduler-evidence-audit.json",
    });
  });

  it("creates bounded failure and validation reports without retaining raw evidence", async () => {
    const cli = await loadCli();
    const generatedAt = "2026-08-10T11:30:00.000Z";
    const failure = cli.createFailureReport("provider failure", generatedAt);
    expect(failure).toMatchObject({
      generated_at: generatedAt,
      status: "FAIL",
      failures: [{ code: "evidence_collection_failed", detail: "provider failure" }],
    });

    const evidence = passingEvidence();
    const validation = cli.createValidationReport(
      { ...evidence, unretained_raw_payload: "must-not-survive" },
      { status: "PASS", checks: [], failures: [] },
      generatedAt,
    );
    expect(validation).toMatchObject({
      generated_at: generatedAt,
      scheduler_task_identity: evidence.scheduler_task_identity,
      prompt_sha256: evidence.prompt_sha256,
      protected_main_sha: evidence.protected_main_sha,
      status: "PASS",
    });
    expect(JSON.stringify(validation)).not.toContain("must-not-survive");

    const sensitiveFailureValue = "credential-like-value-must-not-survive";
    const failedValidation = cli.createValidationReport(
      {
        ...evidence,
        scheduler_task_identity: sensitiveFailureValue,
        prompt_sha256: sensitiveFailureValue,
        protected_main_sha: sensitiveFailureValue,
        scheduled_at: sensitiveFailureValue,
        started_at: sensitiveFailureValue,
      },
      {
        status: "FAIL",
        checks: [{ code: "repository_mismatch", pass: false, detail: "Repository mismatch." }],
        failures: [{ code: "repository_mismatch", detail: "Repository mismatch." }],
      },
      generatedAt,
    );
    expect(failedValidation.status).toBe("FAIL");
    expect(failedValidation).not.toHaveProperty("scheduler_task_identity");
    expect(failedValidation).not.toHaveProperty("prompt_sha256");
    expect(failedValidation).not.toHaveProperty("protected_main_sha");
    expect(failedValidation).not.toHaveProperty("scheduled_at");
    expect(failedValidation).not.toHaveProperty("started_at");
    expect(JSON.stringify(failedValidation)).not.toContain(sensitiveFailureValue);
  });

  it("runs the pass path without setting an exit code", async () => {
    const cli = await loadCli();
    const outputs: string[] = [];
    const exitCodes: number[] = [];
    const writtenReports: Array<{ path: string; report: Record<string, unknown> }> = [];

    const report = cli.main({
      env: {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: "/input/evidence.json",
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: "/output/report.json",
      },
      argv: ["node", "script"],
      now: () => "2026-08-10T11:31:00.000Z",
      readEvidence: (path: string) => {
        expect(path).toBe("/input/evidence.json");
        return passingEvidence();
      },
      writeReport: (path: string, value: Record<string, unknown>) => {
        writtenReports.push({ path, report: value });
        return "/absolute/output/report.json";
      },
      writeOutput: (value: string) => outputs.push(value),
      setExitCode: (code: number) => exitCodes.push(code),
    });

    expect(report.status).toBe("PASS");
    expect(exitCodes).toEqual([]);
    expect(writtenReports).toHaveLength(1);
    expect(JSON.parse(outputs.join(""))).toEqual({
      status: "PASS",
      report_path: "/absolute/output/report.json",
    });
  });

  it("runs validation and collection failures fail-closed", async () => {
    const cli = await loadCli();
    const exitCodes: number[] = [];
    const reports: Array<Record<string, unknown>> = [];
    const common = {
      env: {},
      argv: ["node", "script", "/input/evidence.json"],
      now: () => "2026-08-10T11:32:00.000Z",
      writeReport: (_path: string, value: Record<string, unknown>) => {
        reports.push(value);
        return "/absolute/report.json";
      },
      writeOutput: () => undefined,
      setExitCode: (code: number) => exitCodes.push(code),
    };

    const invalidReport = cli.main({
      ...common,
      readEvidence: () => ({
        ...passingEvidence(),
        repository_full_name: "ContextualWisdomLab/other",
      }),
    });
    const collectionReport = cli.main({
      ...common,
      readEvidence: () => {
        throw "provider unavailable";
      },
    });

    expect(invalidReport.status).toBe("FAIL");
    expect(collectionReport).toMatchObject({
      status: "FAIL",
      failures: [{ code: "evidence_collection_failed", detail: "provider unavailable" }],
    });
    expect(exitCodes).toEqual([1, 1]);
    expect(reports).toHaveLength(2);
  });

  it("executes only when the module URL matches argv[1]", async () => {
    const cli = await loadCli();
    const executions: string[] = [];
    const scriptPath = fileURLToPath(cliUrl);

    expect(cli.runIfDirect(cliUrl.href, ["node"], () => executions.push("missing"))).toBe(false);
    expect(cli.runIfDirect(cliUrl.href, ["node", `${scriptPath}.other`], () => executions.push("other"))).toBe(false);
    expect(cli.runIfDirect(cliUrl.href, ["node", scriptPath], () => executions.push("direct"))).toBe(true);
    expect(executions).toEqual(["direct"]);
  });
});
