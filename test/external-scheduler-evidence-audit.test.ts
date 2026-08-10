import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repository = "ContextualWisdomLab/noema";
const moduleUrl = new URL(
  "../scripts/lib/external-scheduler-evidence-audit.mjs",
  import.meta.url,
);
const packageJson = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
);

async function loadEvaluator() {
  const modulePath = fileURLToPath(moduleUrl);
  expect(existsSync(modulePath)).toBe(true);
  if (!existsSync(modulePath)) {
    throw new Error("external scheduler evidence evaluator is missing");
  }
  const implementation = await import(moduleUrl.href);
  return implementation.evaluateExternalSchedulerEvidence as (
    evidence: Record<string, unknown>,
  ) => {
    status: "PASS" | "FAIL";
    checks: Array<{ code: string; pass: boolean }>;
    failures: Array<{ code: string; detail: string }>;
  };
}

function passingEvidence() {
  const resultingSha = "c".repeat(40);
  return {
    schema_version: 1,
    scheduler_task_identity: "chatgpt-task:noema-hourly-primary",
    prompt_sha256: "a".repeat(64),
    scheduled_at: "2026-08-10T11:00:00.000Z",
    started_at: "2026-08-10T11:00:05.000Z",
    repository_full_name: repository,
    protected_main_sha: "b".repeat(40),
    generic_error_observed: true,
    generic_error_recovery: {
      task_refetched: true,
      github_refetched: true,
      hidden_error_code_invented: false,
      repository_execution_resumed: true,
      resumed_action_identity: "issue:96",
    },
    safe_independent_lane_count: 2,
    github_actions_performed: [
      {
        action_identity: "issue:96",
        action_kind: "issue_created",
        target_repository: repository,
        target_ref: "issues/96",
      },
      {
        action_identity: `commit:${resultingSha}`,
        action_kind: "source_commit",
        target_repository: repository,
        target_ref: "refs/heads/feat/external-scheduler-evidence-audit",
        resulting_sha: resultingSha,
      },
    ],
    deferred_lanes: [
      {
        lane_identity: `pr:95@${"d".repeat(40)}`,
        reason_code: "competing_writer_detected",
      },
    ],
    termination_reason: "double_exit_sweep",
    exit_sweep_count: 2,
    remaining_non_actionable_reasons: ["independent_approval_unavailable"],
  };
}

function failureCodes(result: {
  failures: Array<{ code: string }>;
}) {
  return result.failures.map((failure) => failure.code);
}

describe("external hourly scheduler evidence audit", () => {
  it("passes exact scheduler, recovery, work-conserving, and exit evidence", async () => {
    const evaluate = await loadEvaluator();
    const result = evaluate(passingEvidence());

    expect(result.status).toBe("PASS");
    expect(result.failures).toEqual([]);
    expect(result.checks.every((check) => check.pass)).toBe(true);
  });

  it.each([
    ["wrong schema", { schema_version: 2 }, "schema_version_invalid"],
    [
      "wrong repository",
      { repository_full_name: "ContextualWisdomLab/other" },
      "repository_mismatch",
    ],
    ["uppercase prompt digest", { prompt_sha256: "A".repeat(64) }, "prompt_sha256_invalid"],
    [
      "uppercase protected head",
      { protected_main_sha: "B".repeat(40) },
      "protected_main_sha_invalid",
    ],
    [
      "control byte in task identity",
      { scheduler_task_identity: "task\nother" },
      "scheduler_task_identity_invalid",
    ],
    [
      "start before schedule",
      { started_at: "2026-08-10T10:59:59.000Z" },
      "scheduler_time_order_invalid",
    ],
  ])("fails closed for %s", async (_label, patch, expectedCode) => {
    const evaluate = await loadEvaluator();
    const result = evaluate({ ...passingEvidence(), ...patch });

    expect(result.status).toBe("FAIL");
    expect(failureCodes(result)).toContain(expectedCode);
  });

  it.each([
    ["task refetch", { task_refetched: false }, "generic_error_task_refetch_missing"],
    ["GitHub refetch", { github_refetched: false }, "generic_error_github_refetch_missing"],
    [
      "invented hidden error code",
      { hidden_error_code_invented: true },
      "generic_error_hidden_code_invented",
    ],
    [
      "repository continuation",
      { repository_execution_resumed: false },
      "generic_error_repository_execution_not_resumed",
    ],
    [
      "resumed action identity",
      { resumed_action_identity: "" },
      "generic_error_resumed_action_missing",
    ],
  ])("requires %s after a generic scheduler error", async (_label, patch, expectedCode) => {
    const evaluate = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.generic_error_recovery = {
      ...evidence.generic_error_recovery,
      ...patch,
    };

    const result = evaluate(evidence);

    expect(failureCodes(result)).toContain(expectedCode);
  });

  it("does not require recovery assertions when no generic error was observed", async () => {
    const evaluate = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.generic_error_observed = false;
    delete (evidence as { generic_error_recovery?: unknown }).generic_error_recovery;

    const result = evaluate(evidence);

    expect(result.status).toBe("PASS");
  });

  it("requires two materially distinct actions when two safe lanes existed", async () => {
    const evaluate = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.github_actions_performed = [evidence.github_actions_performed[0]];

    const result = evaluate(evidence);

    expect(failureCodes(result)).toContain("work_conserving_action_count_insufficient");
  });

  it("rejects duplicate action identities and kinds as one material action", async () => {
    const evaluate = await loadEvaluator();
    const evidence = passingEvidence();
    evidence.github_actions_performed = [
      evidence.github_actions_performed[0],
      {
        ...evidence.github_actions_performed[0],
        target_ref: "issues/97",
      },
    ];

    const result = evaluate(evidence);

    expect(failureCodes(result)).toEqual(expect.arrayContaining([
      "github_action_identity_duplicate",
      "materially_distinct_actions_missing",
    ]));
  });

  it("requires exactly two fresh sweeps for a normal double-sweep exit", async () => {
    const evaluate = await loadEvaluator();
    const result = evaluate({ ...passingEvidence(), exit_sweep_count: 1 });

    expect(failureCodes(result)).toContain("exit_sweep_incomplete");
  });

  it("accepts explicit practical invocation-budget exhaustion with bounded evidence", async () => {
    const evaluate = await loadEvaluator();
    const evidence = {
      ...passingEvidence(),
      termination_reason: "invocation_budget_exhausted",
      exit_sweep_count: 1,
      budget_exhaustion_detail: "Connector invocation budget ended after exact-head revalidation.",
    };

    const result = evaluate(evidence);

    expect(result.status).toBe("PASS");
  });

  it("rejects a budget exit without a concrete bounded reason", async () => {
    const evaluate = await loadEvaluator();
    const evidence = {
      ...passingEvidence(),
      termination_reason: "invocation_budget_exhausted",
      exit_sweep_count: 0,
      budget_exhaustion_detail: "",
    };

    const result = evaluate(evidence);

    expect(failureCodes(result)).toContain("budget_exhaustion_detail_missing");
  });

  it.each(["token", "private_key", "password", "chain_of_thought"])(
    "rejects retained sensitive field %s anywhere in evidence",
    async (field) => {
      const evaluate = await loadEvaluator();
      const evidence = {
        ...passingEvidence(),
        nested_evidence: {
          [field]: "must-not-be-retained",
        },
      };

      const result = evaluate(evidence);

      expect(failureCodes(result)).toContain("forbidden_sensitive_field");
    },
  );

  it("exposes a repository-owned operator command", () => {
    expect(packageJson.scripts?.["operations:external-scheduler-evidence"]).toBe(
      "node scripts/external-scheduler-evidence-audit.mjs",
    );
  });
});
