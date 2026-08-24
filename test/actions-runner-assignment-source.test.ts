import { describe, expect, it, vi } from "vitest";
import {
  collectRunnerAssignmentEvidence,
  flattenJobPages,
  MAX_SELECTED_RUNS,
  parseSelectedRunIds,
} from "../scripts/lib/actions-runner-assignment-source.mjs";

const expectedHead = "0123456789abcdef0123456789abcdef01234567";

describe("GitHub Actions runner-assignment evidence source", () => {
  it("parses a unique bounded run-id selection", () => {
    expect(parseSelectedRunIds("101, 202,303")).toEqual([101, 202, 303]);
  });

  it.each([
    ["", "at least one"],
    ["101,101", "unique"],
    ["101,zero", "positive integer"],
    ["1".repeat(1001), "at most 1000 bytes"],
    [Array.from({ length: MAX_SELECTED_RUNS + 1 }, (_, index) => index + 1).join(","), "at most"],
  ])("rejects malformed or unbounded run selection %s", (value, message) => {
    expect(() => parseSelectedRunIds(value)).toThrow(message);
  });

  it("flattens all paginated jobs and rejects malformed page objects", () => {
    expect(flattenJobPages([{ jobs: [{ id: 11 }] }, { jobs: [{ id: 12 }, { id: 13 }] }])).toEqual([{ id: 11 }, { id: 12 }, { id: 13 }]);
    expect(() => flattenJobPages([{ jobs: [] }, { unexpected: [] }])).toThrow("jobs array");
  });

  it("requires both read-only adapters before collection", async () => {
    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101],
      fetch_run: vi.fn(),
      fetch_job_pages: undefined,
    })).rejects.toThrow("Read-only workflow-run and job-page adapters are required");
  });

  it("enforces the 2000-job evidence bound across all selected runs", async () => {
    const fetchRun = vi.fn(async (runId: number) => ({
      id: runId,
      name: `workflow-${runId}`,
      event: "pull_request",
      head_sha: expectedHead,
      run_attempt: 1,
      status: "completed",
      conclusion: "success",
      created_at: "2026-08-09T23:50:00.000Z",
    }));
    const fetchJobPages = vi.fn(async (runId: number) => [{
      jobs: Array.from({ length: 1001 }, (_, index) => ({
        id: runId * 10_000 + index + 1,
        name: `job-${index + 1}`,
        status: "completed",
        conclusion: "success",
        started_at: "2026-08-09T23:51:00.000Z",
        completed_at: "2026-08-09T23:52:00.000Z",
        runner_id: 44,
        runner_name: "GitHub Actions 44",
      })),
    }]);

    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101, 202],
      fetch_run: fetchRun,
      fetch_job_pages: fetchJobPages,
    })).rejects.toThrow("2000-job bound");
  });

  it("binds selected pull-request runs and every paginated job to the expected source head", async () => {
    const fetchRun = vi.fn(async (runId: number) => ({
      id: runId,
      name: runId === 101 ? "ci" : "reviewer-ci",
      event: "pull_request",
      head_sha: expectedHead,
      run_attempt: 1,
      status: "completed",
      conclusion: runId === 101 ? "failure" : "success",
      created_at: "2026-08-09T23:50:00.000Z",
    }));
    const fetchJobPages = vi.fn(async (runId: number) => [{ jobs: [{
      id: runId * 10,
      name: "verify",
      status: "completed",
      conclusion: runId === 101 ? "failure" : "success",
      started_at: "2026-08-09T23:51:00.000Z",
      completed_at: "2026-08-09T23:52:00.000Z",
      runner_id: 44,
      runner_name: "GitHub Actions 44",
    }] }]);

    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101, 202],
      fetch_run: fetchRun,
      fetch_job_pages: fetchJobPages,
    })).resolves.toEqual({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      runs: [
        expect.objectContaining({ id: 101, head_sha: expectedHead, run_attempt: 1, jobs: [expect.objectContaining({ id: 1010, runner_id: 44 })] }),
        expect.objectContaining({ id: 202, head_sha: expectedHead, run_attempt: 1, jobs: [expect.objectContaining({ id: 2020, runner_id: 44 })] }),
      ],
    });
    expect(fetchRun).toHaveBeenCalledTimes(2);
    expect(fetchJobPages).toHaveBeenCalledTimes(2);
  });

  it("reads jobs only from the current workflow-run attempt", async () => {
    const fetchRun = vi.fn(async () => ({
      id: 101,
      name: "ci",
      event: "pull_request",
      head_sha: expectedHead,
      run_attempt: 2,
      status: "queued",
      conclusion: null,
      created_at: "2026-08-09T23:50:00.000Z",
    }));
    const fetchJobPages = vi.fn(async (_runId: number, runAttempt: number) => {
      if (runAttempt !== 2) {
        throw new Error("current workflow-run attempt is required");
      }
      return [{ jobs: [{
        id: 2020,
        name: "verify",
        status: "queued",
        conclusion: null,
        started_at: null,
        completed_at: null,
        runner_id: 0,
        runner_name: "",
      }] }];
    });

    await expect(collectRunnerAssignmentEvidence({
      expected_head_sha: expectedHead,
      observed_at: "2026-08-10T00:00:00.000Z",
      queue_grace_milliseconds: 300_000,
      run_ids: [101],
      fetch_run: fetchRun,
      fetch_job_pages: fetchJobPages,
    })).resolves.toEqual(expect.objectContaining({
      runs: [expect.objectContaining({
        id: 101,
        run_attempt: 2,
        jobs: [expect.objectContaining({ id: 2020, runner_id: 0 })],
      })],
    }));
    expect(fetchJobPages).toHaveBeenCalledWith(101, 2);
  });
});