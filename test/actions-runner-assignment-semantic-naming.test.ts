import { describe, expect, it } from "vitest";

import { collectRunnerAssignmentEvidence } from "../scripts/lib/actions-runner-assignment-source.mjs";

const expectedHeadSha = "0123456789abcdef0123456789abcdef01234567";

describe("runner-assignment semantic evidence naming", () => {
  it("translates vendor run and job fields into bounded-context names", async () => {
    const evidence = await collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHeadSha,
      observed_at: "2026-09-02T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101],
      fetch_run: async () => ({
        id: 101,
        name: "reviewer-ci",
        event: "pull_request",
        head_sha: expectedHeadSha,
        run_attempt: 2,
        status: "completed",
        conclusion: "success",
        created_at: "2026-09-01T23:50:00.000Z",
      }),
      fetch_job_pages: async () => [{
        jobs: [{
          id: 202,
          name: "verify",
          run_attempt: 2,
          status: "completed",
          conclusion: "success",
          started_at: "2026-09-01T23:51:00.000Z",
          completed_at: "2026-09-01T23:52:00.000Z",
          runner_id: 44,
          runner_name: "GitHub Actions 44",
        }],
      }],
    });

    expect(evidence).toEqual(expect.objectContaining({
      workflow_runs: [expect.objectContaining({
        workflow_run_id: 101,
        workflow_name: "reviewer-ci",
        trigger_event: "pull_request",
        workflow_run_status: "completed",
        workflow_conclusion: "success",
        workflow_jobs: [expect.objectContaining({
          workflow_job_id: 202,
          workflow_job_name: "verify",
          workflow_job_status: "completed",
          workflow_job_conclusion: "success",
          runner_id: 44,
          runner_name: "GitHub Actions 44",
        })],
      })],
    }));

    expect(evidence).not.toHaveProperty("runs");
    const workflowRun = evidence.workflow_runs[0];
    expect(workflowRun).not.toHaveProperty("id");
    expect(workflowRun).not.toHaveProperty("name");
    expect(workflowRun).not.toHaveProperty("event");
    expect(workflowRun).not.toHaveProperty("status");
    expect(workflowRun).not.toHaveProperty("conclusion");
    expect(workflowRun).not.toHaveProperty("jobs");
    const workflowJob = workflowRun.workflow_jobs[0];
    expect(workflowJob).not.toHaveProperty("id");
    expect(workflowJob).not.toHaveProperty("name");
    expect(workflowJob).not.toHaveProperty("status");
    expect(workflowJob).not.toHaveProperty("conclusion");
  });
});
