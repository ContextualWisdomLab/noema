import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const cliUrl = new URL(
  "../scripts/external-scheduler-evidence-audit.mjs",
  import.meta.url,
);
const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-scheduler-defaults-"));
  temporaryDirectories.push(directory);
  return directory;
}

function restoreEnvironmentValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
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

describe("external scheduler evidence CLI production defaults", () => {
  it("uses real process, clock, filesystem, output, and exit-code defaults", async () => {
    const cli = await import(cliUrl.href) as Record<string, any>;
    const directory = temporaryDirectory();
    const originalDirectory = process.cwd();
    const originalArgv = [...process.argv];
    const originalEvidencePath = process.env.NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH;
    const originalAuditPath = process.env.NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH;
    const originalExitCode = process.exitCode;

    try {
      process.chdir(directory);
      process.argv.splice(0, process.argv.length, "node", "script");
      delete process.env.NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH;
      delete process.env.NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH;
      process.exitCode = undefined;

      writeFileSync(
        "external-scheduler-evidence.json",
        `${JSON.stringify(passingEvidence())}\n`,
        "utf8",
      );
      const passReport = cli.main();
      const reportPath = join(
        directory,
        "artifacts",
        "operations",
        "external-scheduler-evidence-audit.json",
      );

      expect(passReport.status).toBe("PASS");
      expect(process.exitCode).toBeUndefined();
      expect(existsSync(reportPath)).toBe(true);
      expect(JSON.parse(readFileSync(reportPath, "utf8")).status).toBe("PASS");

      rmSync("external-scheduler-evidence.json");
      const failReport = cli.main();

      expect(failReport.status).toBe("FAIL");
      expect(process.exitCode).toBe(1);
      expect(JSON.parse(readFileSync(reportPath, "utf8")).status).toBe("FAIL");
    } finally {
      process.chdir(originalDirectory);
      process.argv.splice(0, process.argv.length, ...originalArgv);
      restoreEnvironmentValue(
        "NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH",
        originalEvidencePath,
      );
      restoreEnvironmentValue(
        "NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH",
        originalAuditPath,
      );
      process.exitCode = originalExitCode;
    }
  });
});
