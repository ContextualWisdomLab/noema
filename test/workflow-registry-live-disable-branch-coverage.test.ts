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

const ORIGINAL_ENV = { ...process.env };

function restoreEnvironment() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) delete process.env[key];
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

afterEach(() => {
  restoreEnvironment();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("workflow registry live-disable branch coverage", () => {
  it("rejects missing delegated token and fetch capability", () => {
    expect(() => createWorkflowRegistryGithubJsonReader({ token: "" })).toThrow(
      "requires a delegated token",
    );
    vi.stubGlobal("fetch", undefined);
    expect(() => createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
    })).toThrow("requires fetch capability");
  });

  it("rejects malformed and escaping GitHub endpoints before network I/O", async () => {
    const fetchImpl = vi.fn();
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await expect(ghJson("")).rejects.toThrow("endpoint is invalid");
    await expect(ghJson("repos\\ContextualWisdomLab/noema/actions/workflows")).rejects.toThrow(
      "endpoint is invalid",
    );
    await expect(ghJson("https://example.com/repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("escapes the Noema repository boundary");
    await expect(ghJson("https://user@example.com/repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("escapes the Noema repository boundary");
    await expect(ghJson("https://github.com/repos/ContextualWisdomLab/noema/actions/workflows#fragment"))
      .rejects.toThrow("escapes the Noema repository boundary");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("normalizes non-timeout transport rejection without leaking the rejected value", async () => {
    const ghJson = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn().mockRejectedValue("remote-secret") as unknown as typeof fetch,
    });

    await expect(ghJson("repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("failed before receiving an HTTP response");
  });

  it("rejects advertised and actual response sizes above the bounded limit", async () => {
    const advertised = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => String((8 * 1024 * 1024) + 1) },
        arrayBuffer: vi.fn(),
      }) as unknown as typeof fetch,
    });
    await expect(advertised("repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("bounded size limit");

    const bytes = new Uint8Array((8 * 1024 * 1024) + 1);
    const actual = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => bytes.buffer,
      }) as unknown as typeof fetch,
    });
    await expect(actual("repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("bounded size limit");
  });

  it("rejects malformed UTF-8 and duplicate decoded JSON keys", async () => {
    const malformedUtf8 = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => new Uint8Array([0xc3, 0x28]).buffer,
      }) as unknown as typeof fetch,
    });
    await expect(malformedUtf8("repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("invalid UTF-8");

    const duplicateBytes = new TextEncoder().encode('{"workflows":[],"\\u0077orkflows":[]}');
    const duplicateKeys = createWorkflowRegistryGithubJsonReader({
      token: "delegated-token",
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        arrayBuffer: async () => duplicateBytes.buffer,
      }) as unknown as typeof fetch,
    });
    await expect(duplicateKeys("repos/ContextualWisdomLab/noema/actions/workflows"))
      .rejects.toThrow("duplicate decoded JSON keys");
  });

  it("fails closed when live record collection input is missing", async () => {
    await expect(collectLiveWorkflowRecords({
      repository: "ContextualWisdomLab/noema",
      ghJson: undefined as unknown as (endpoint: string) => Promise<unknown>,
    })).rejects.toThrow("restricted to ContextualWisdomLab/noema");
  });

  it("rejects missing post-audit workflow evidence after a successful mutation", async () => {
    const audit = {
      schema_version: 1,
      status: "FAIL",
      repository_full_name: "ContextualWisdomLab/noema",
      default_branch_sha: "a".repeat(40),
      observed_at: "2026-08-16T00:00:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      workflows: [{
        workflow_id: 101,
        workflow_path: ".github/workflows/orphan.yml",
        workflow_state: "active",
        classification: "active_orphan",
      }],
      failures: [{ code: "active_orphan_workflow", workflow_id: 101 }],
    };
    const liveWorkflows = [{ id: 101, path: ".github/workflows/orphan.yml", state: "active" }];
    let workflowState = "active";
    let auditCalls = 0;

    await expect(runWorkflowRegistryDisablement({
      repository: "ContextualWisdomLab/noema",
      workflowId: 101,
      collectAudit: async () => {
        auditCalls += 1;
        if (auditCalls === 1) return audit;
        return { ...audit, workflows: [] };
      },
      collectLiveWorkflows: async () => liveWorkflows,
      transport: {
        revalidateDefaultBranch: async () => ({ sha: audit.default_branch_sha }),
        revalidateWorkflow: async () => ({
          id: 101,
          path: ".github/workflows/orphan.yml",
          state: workflowState,
        }),
        disableWorkflow: async () => {
          workflowState = "disabled_manually";
        },
      },
    })).rejects.toThrow("full post-disablement audit did not retain the exact disabled workflow identity");
  });

  it("rejects a malformed post-audit record without substituting identity", async () => {
    const audit = {
      schema_version: 1,
      status: "FAIL",
      repository_full_name: "ContextualWisdomLab/noema",
      default_branch_sha: "b".repeat(40),
      observed_at: "2026-08-16T00:00:00.000Z",
      pagination_receipts: [{ page: 1, itemCount: 1, hasNext: false }],
      workflows: [{
        workflow_id: 101,
        workflow_path: ".github/workflows/orphan.yml",
        workflow_state: "active",
        classification: "active_orphan",
      }],
      failures: [{ code: "active_orphan_workflow", workflow_id: 101 }],
    };
    let workflowState = "active";
    let auditCalls = 0;

    await expect(runWorkflowRegistryDisablement({
      repository: "ContextualWisdomLab/noema",
      workflowId: 101,
      collectAudit: async () => {
        auditCalls += 1;
        if (auditCalls === 1) return audit;
        return { ...audit, workflows: null };
      },
      collectLiveWorkflows: async () => [
        { id: 101, path: ".github/workflows/orphan.yml", state: "active" },
      ],
      transport: {
        revalidateDefaultBranch: async () => ({ sha: audit.default_branch_sha }),
        revalidateWorkflow: async () => ({
          id: 101,
          path: ".github/workflows/orphan.yml",
          state: workflowState,
        }),
        disableWorkflow: async () => {
          workflowState = "disabled_manually";
        },
      },
    })).rejects.toThrow("full post-disablement audit did not retain the exact disabled workflow identity");
  });

  it("bounds non-Error CLI failures and redacts secrets", async () => {
    const errors: string[] = [];
    const exitCodes: number[] = [];
    await startCli({
      mainFn: async () => {
        throw "Bearer secret\nwith-control";
      },
      stderr: (value: unknown) => errors.push(String(value)),
      setExitCode: (value: number) => exitCodes.push(value),
    });
    expect(errors).toEqual(["workflow-registry-disable failed: Bearer [REDACTED]with-control"]);
    expect(exitCodes).toEqual([1]);
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
      await expect(main()).rejects.toThrow("Maintainer token file path is required.");
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
