import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectLiveWorkflowRecords,
  createWorkflowRegistryGithubJsonReader,
  main,
  runIfDirect,
  runWorkflowRegistryDisablement,
  startCli,
} from "../scripts/workflow-registry-live-disable.mjs";

const REPOSITORY = "ContextualWisdomLab/noema";
const MAIN_SHA = "a".repeat(40);
const ORPHAN_PATH = ".github/workflows/obsolete-repair.yml";

function response(body = "{}", contentLength: string | null = null) {
  const bytes = new TextEncoder().encode(body);
  return {
    ok: true,
    status: 200,
    headers: { get: () => contentLength },
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

function activeAudit() {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: "2026-08-16T05:40:00.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "FAIL",
    failures: [{ code: "active_orphan_workflow", workflow_id: 101 }],
    workflows: [{
      workflow_id: 101,
      workflow_path: ORPHAN_PATH,
      workflow_state: "active",
      classification: "active_orphan",
    }],
  };
}

function transport() {
  return {
    revalidateDefaultBranch: vi.fn().mockResolvedValue({ sha: MAIN_SHA }),
    revalidateWorkflow: vi
      .fn()
      .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "active" })
      .mockResolvedValueOnce({ id: 101, path: ORPHAN_PATH, state: "disabled_manually" }),
    disableWorkflow: vi.fn().mockResolvedValue(undefined),
  };
}

function postAudit(workflows: unknown) {
  return {
    schema_version: 1,
    repository_full_name: REPOSITORY,
    default_branch_sha: MAIN_SHA,
    observed_at: "2026-08-16T05:40:01.000Z",
    pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
    status: "PASS",
    failures: [],
    workflows,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflow live-disable residual branch boundaries", () => {
  it("rejects missing reader input and non-string endpoints before network access", async () => {
    expect(() => createWorkflowRegistryGithubJsonReader(undefined as never)).toThrow("requires a delegated token");
    const fetchImpl = vi.fn();
    const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl });
    await expect(reader(undefined as never)).rejects.toThrow("endpoint is invalid");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects userinfo and fragments even when origin and repository path otherwise match", async () => {
    const fetchImpl = vi.fn();
    const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl });
    const unsafe = [
      `https://operator@api.github.com/repos/${REPOSITORY}/actions/workflows`,
      `https://:secret@api.github.com/repos/${REPOSITORY}/actions/workflows`,
      `https://api.github.com/repos/${REPOSITORY}/actions/workflows#fragment`,
    ];
    for (const endpoint of unsafe) {
      await expect(reader(endpoint)).rejects.toThrow("escapes the Noema repository boundary");
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("accepts a response without a numeric advertised content length and still parses bounded bytes", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response('{"total_count":0,"workflows":[]}', "unknown"));
    const reader = createWorkflowRegistryGithubJsonReader({ token: "delegated", fetchImpl });
    await expect(reader(`repos/${REPOSITORY}/actions/workflows`)).resolves.toEqual({ total_count: 0, workflows: [] });
  });

  it("maps a non-Error rejected fetch without leaking thrown payloads", async () => {
    const reader = createWorkflowRegistryGithubJsonReader({
      token: "delegated",
      fetchImpl: vi.fn().mockRejectedValue(undefined),
    });
    await expect(reader(`repos/${REPOSITORY}/actions/workflows`)).rejects.toThrow(
      "failed before receiving an HTTP response",
    );
  });

  it("uses the exact Noema repository as the collection default and rejects absent collector input", async () => {
    const ghJson = vi.fn().mockResolvedValue({ total_count: 0, workflows: [] });
    await expect(collectLiveWorkflowRecords({ ghJson })).resolves.toEqual([]);
    expect(ghJson).toHaveBeenCalledWith(`repos/${REPOSITORY}/actions/workflows?per_page=100&page=1`);
    await expect(collectLiveWorkflowRecords(undefined as never)).rejects.toThrow(
      "restricted to ContextualWisdomLab/noema",
    );
  });

  it("covers each fail-closed collector and transport capability boundary", async () => {
    await expect(runWorkflowRegistryDisablement(undefined as never)).rejects.toThrow("positive safe integer");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: Number.NaN,
      collectAudit: vi.fn(),
      collectLiveWorkflows: vi.fn(),
      transport: transport(),
    })).rejects.toThrow("positive safe integer");

    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit: vi.fn(),
    })).rejects.toThrow("missing fresh evidence collectors");

    const collectAudit = vi.fn();
    const collectLiveWorkflows = vi.fn();
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows,
      transport: { revalidateDefaultBranch: vi.fn() },
    })).rejects.toThrow("missing authorized transport");
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows,
      transport: { revalidateDefaultBranch: vi.fn(), revalidateWorkflow: vi.fn() },
    })).rejects.toThrow("missing authorized transport");
  });

  it("fails closed when post-audit evidence disappears after a successful mutation", async () => {
    const collectAudit = vi.fn()
      .mockResolvedValueOnce(activeAudit())
      .mockResolvedValueOnce(undefined);
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: transport(),
    })).rejects.toThrow("repository identity changed during post-disablement verification");
  });

  it("rejects non-array and classification-only postcondition substitutions", async () => {
    for (const workflows of [
      null,
      [{
        workflow_id: 101,
        workflow_path: ORPHAN_PATH,
        workflow_state: "disabled_manually",
        classification: "active_orphan",
      }],
    ]) {
      const collectAudit = vi.fn()
        .mockResolvedValueOnce(activeAudit())
        .mockResolvedValueOnce(postAudit(workflows));
      await expect(runWorkflowRegistryDisablement({
        repository: REPOSITORY,
        workflowId: 101,
        collectAudit,
        collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
        transport: transport(),
      })).rejects.toThrow("did not retain the exact disabled workflow identity");
    }
  });

  it("ignores malformed post-audit entries while retaining the exact disabled identity", async () => {
    const workflows = [
      undefined,
      {
        workflow_id: 101,
        workflow_path: ORPHAN_PATH,
        workflow_state: "disabled_manually",
        classification: "disabled_registry_record",
      },
    ];
    const collectAudit = vi.fn()
      .mockResolvedValueOnce(activeAudit())
      .mockResolvedValueOnce(postAudit(workflows));
    await expect(runWorkflowRegistryDisablement({
      repository: REPOSITORY,
      workflowId: 101,
      collectAudit,
      collectLiveWorkflows: vi.fn().mockResolvedValue([{ id: 101, path: ORPHAN_PATH, state: "active" }]),
      transport: transport(),
    })).resolves.toMatchObject({ workflow_id: 101, final_state: "disabled_manually" });
  });

  it("bounds non-Error CLI failures without treating thrown values as trusted text", async () => {
    const stderr = vi.fn();
    const setExitCode = vi.fn();
    await startCli({
      mainFn: vi.fn(async () => { throw "Bearer delegated-secret\u0000"; }),
      stderr,
      setExitCode,
    });
    expect(setExitCode).toHaveBeenCalledWith(1);
    expect(String(stderr.mock.calls[0]?.[0] ?? "")).toContain("Bearer [REDACTED]");
    expect(String(stderr.mock.calls[0]?.[0] ?? "")).not.toContain("delegated-secret");
  });

  it("uses default CLI failure boundaries when no delegated capability is available", async () => {
    const originalArgv = process.argv;
    const originalTokenPath = process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    const originalExitCode = process.exitCode;
    const stderr = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      process.argv = ["node", "workflow-registry-live-disable.mjs", "101"];
      process.exitCode = 0;
      await expect(startCli()).resolves.toBeUndefined();
      expect(stderr).toHaveBeenCalledTimes(1);
      expect(process.exitCode).toBe(1);
    } finally {
      process.argv = originalArgv;
      if (originalTokenPath === undefined) delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      else process.env.NOEMA_MAINTAINER_TOKEN_PATH = originalTokenPath;
      process.exitCode = originalExitCode;
    }
  });

  it("does not dispatch a direct-run check for an empty executable target", () => {
    const starter = vi.fn();
    const pathToFileUrlFn = vi.fn();
    expect(runIfDirect({
      scriptUrl: "file:///operator.mjs",
      argv: ["node", ""],
      pathToFileUrlFn,
      starter,
    })).toBe(false);
    expect(pathToFileUrlFn).not.toHaveBeenCalled();
    expect(starter).not.toHaveBeenCalled();
  });

  it("fails closed when CLI authority or workflow identity is absent while exercising defaults", async () => {
    const originalArgv = process.argv;
    const originalRepository = process.env.GITHUB_REPOSITORY;
    const originalTokenPath = process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    const directory = await mkdtemp(join(tmpdir(), "noema-live-disable-defaults-"));
    const tokenPath = join(directory, "github-token");
    try {
      await writeFile(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
      await chmod(tokenPath, 0o600);
      delete process.env.GITHUB_REPOSITORY;
      process.env.NOEMA_MAINTAINER_TOKEN_PATH = tokenPath;
      process.argv = ["node", "workflow-registry-live-disable.mjs"];
      await expect(main()).rejects.toThrow("positive safe integer");

      delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      process.argv = ["node", "workflow-registry-live-disable.mjs", "101"];
      await expect(main()).rejects.toThrow();
    } finally {
      process.argv = originalArgv;
      if (originalRepository === undefined) delete process.env.GITHUB_REPOSITORY;
      else process.env.GITHUB_REPOSITORY = originalRepository;
      if (originalTokenPath === undefined) delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      else process.env.NOEMA_MAINTAINER_TOKEN_PATH = originalTokenPath;
      await rm(directory, { recursive: true, force: true });
    }
  });
});
