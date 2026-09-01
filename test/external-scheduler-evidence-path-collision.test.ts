import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  main,
  readExternalSchedulerEvidence,
  writeAtomicJson,
} from "../scripts/external-scheduler-evidence-audit.mjs";

const temporaryDirectories: string[] = [];

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), "noema-scheduler-path-collision-"));
  temporaryDirectories.push(directory);
  return directory;
}

function passingEvidence() {
  return {
    schema_version: 1,
    scheduler_task_identity: "chatgpt-task:noema-hourly-primary",
    prompt_sha256: "a".repeat(64),
    scheduled_at: "2026-08-10T11:00:00.000Z",
    started_at: "2026-08-10T11:00:05.000Z",
    repository_full_name: "ContextualWisdomLab/noema",
    protected_main_sha: "b".repeat(40),
    generic_error_observed: false,
    safe_independent_lane_count: 1,
    github_actions_performed: [
      {
        action_identity: "issue:96",
        action_kind: "issue_created",
        target_repository: "ContextualWisdomLab/noema",
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

describe("external scheduler evidence path authority", () => {
  it("refuses to replace the retained source evidence with its audit report", () => {
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "external-scheduler-evidence.json");
    const evidenceBytes = `${JSON.stringify(passingEvidence())}\n`;
    writeFileSync(evidencePath, evidenceBytes, "utf8");

    expect(() => main({
      env: {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: evidencePath,
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: evidencePath,
      },
      argv: ["node", "script"],
      now: () => "2026-08-10T11:31:00.000Z",
      writeOutput: () => undefined,
      setExitCode: () => undefined,
    })).toThrow("must resolve to different paths");

    expect(readFileSync(evidencePath, "utf8")).toBe(evidenceBytes);
  });

  it("rejects different pathnames that already identify the same retained evidence inode", () => {
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "external-scheduler-evidence.json");
    const reportPath = join(directory, "external-scheduler-audit.json");
    const evidenceBytes = `${JSON.stringify(passingEvidence())}\n`;
    writeFileSync(evidencePath, evidenceBytes, "utf8");
    linkSync(evidencePath, reportPath);

    expect(() => main({
      env: {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: evidencePath,
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: reportPath,
      },
      argv: ["node", "script"],
      now: () => "2026-08-10T11:31:00.000Z",
      writeOutput: () => undefined,
      setExitCode: () => undefined,
    })).toThrow("must identify different filesystem objects");

    expect(readFileSync(evidencePath, "utf8")).toBe(evidenceBytes);
    expect(readFileSync(reportPath, "utf8")).toBe(evidenceBytes);
  });

  it("does not replace accepted evidence moved onto the report path before publication", () => {
    const directory = temporaryDirectory();
    const evidencePath = join(directory, "external-scheduler-evidence.json");
    const reportPath = join(directory, "external-scheduler-audit.json");
    const evidenceBytes = `${JSON.stringify(passingEvidence())}\n`;
    writeFileSync(evidencePath, evidenceBytes, "utf8");

    expect(() => main({
      env: {
        NOEMA_EXTERNAL_SCHEDULER_EVIDENCE_PATH: evidencePath,
        NOEMA_EXTERNAL_SCHEDULER_AUDIT_PATH: reportPath,
      },
      argv: ["node", "script"],
      now: () => "2026-08-10T11:31:00.000Z",
      readEvidence: (path: string) => {
        const evidence = readExternalSchedulerEvidence(path);
        renameSync(evidencePath, reportPath);
        return evidence;
      },
      writeOutput: () => undefined,
      setExitCode: () => undefined,
    })).toThrow("target must not already exist");

    expect(readFileSync(reportPath, "utf8")).toBe(evidenceBytes);
  });

  it("does not replace an existing scheduler audit receipt", () => {
    const directory = temporaryDirectory();
    const reportPath = join(directory, "external-scheduler-audit.json");
    writeFileSync(reportPath, "preserve-receipt\n", "utf8");

    expect(() => writeAtomicJson(reportPath, { status: "PASS" })).toThrow(
      "target must not already exist",
    );
    expect(readFileSync(reportPath, "utf8")).toBe("preserve-receipt\n");
  });

  it("does not traverse a symlinked retained-evidence parent", () => {
    const directory = temporaryDirectory();
    const outsideDirectory = join(directory, "outside");
    mkdirSync(outsideDirectory);
    const evidenceBytes = `${JSON.stringify(passingEvidence())}\n`;
    writeFileSync(join(outsideDirectory, "evidence.json"), evidenceBytes, "utf8");
    const linkedDirectory = join(directory, "retained");
    symlinkSync(outsideDirectory, linkedDirectory, "dir");

    expect(() => readExternalSchedulerEvidence(join(linkedDirectory, "evidence.json"))).toThrow(
      "parent must be a real directory",
    );
  });

  it("does not traverse a symlinked audit-report parent", () => {
    const directory = temporaryDirectory();
    const outsideDirectory = join(directory, "outside");
    mkdirSync(outsideDirectory);
    const linkedDirectory = join(directory, "reports");
    symlinkSync(outsideDirectory, linkedDirectory, "dir");
    const reportPath = join(linkedDirectory, "audit.json");
    const outsideReportPath = join(outsideDirectory, "audit.json");

    expect(() => writeAtomicJson(reportPath, { status: "PASS" })).toThrow(
      "parent must be a real directory",
    );
    expect(() => readFileSync(outsideReportPath, "utf8")).toThrow();
  });
});
