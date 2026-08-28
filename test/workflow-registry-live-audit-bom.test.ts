import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const spawnState = vi.hoisted(() => ({
  bomFirstBranchResponse: true,
}));

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn((_command: string, args: string[]) => {
    const endpoint = args.at(-1) ?? "";
    const mainSha = "071d116fff8a856809a3553d57506e6e9703b8b4";
    let payload: unknown;
    if (endpoint === "repos/ContextualWisdomLab/noema/branches/main") {
      payload = { commit: { sha: mainSha } };
    } else if (endpoint === `repos/ContextualWisdomLab/noema/git/trees/${mainSha}?recursive=1`) {
      payload = { truncated: false, tree: [] };
    } else if (endpoint === "repos/ContextualWisdomLab/noema/actions/workflows?per_page=100&page=1") {
      payload = { total_count: 0, workflows: [] };
    } else if (endpoint === "repos/ContextualWisdomLab/noema/pulls?state=open&per_page=100&page=1") {
      payload = [];
    } else {
      throw new Error(`unexpected GitHub CLI endpoint: ${endpoint}`);
    }

    const json = JSON.stringify(payload);
    const prefix = endpoint === "repos/ContextualWisdomLab/noema/branches/main" && spawnState.bomFirstBranchResponse
      ? Buffer.from([0xef, 0xbb, 0xbf])
      : Buffer.alloc(0);
    spawnState.bomFirstBranchResponse = false;
    return {
      status: 0,
      stdout: Buffer.concat([prefix, Buffer.from(json, "utf8")]),
      stderr: Buffer.alloc(0),
      error: undefined,
    };
  }),
}));

import { main } from "../scripts/workflow-registry-live-audit.mjs";

const directories: string[] = [];
const priorRepository = process.env.GITHUB_REPOSITORY;
const priorTokenPath = process.env.NOEMA_MAINTAINER_TOKEN_PATH;
const priorExitCode = process.exitCode;

function delegatedTokenFile() {
  const directory = mkdtempSync(join(tmpdir(), "noema-live-audit-bom-"));
  directories.push(directory);
  const path = join(directory, "token");
  writeFileSync(path, "delegated-token-value", { encoding: "utf8", mode: 0o600 });
  return path;
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  if (priorRepository === undefined) delete process.env.GITHUB_REPOSITORY;
  else process.env.GITHUB_REPOSITORY = priorRepository;
  if (priorTokenPath === undefined) delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
  else process.env.NOEMA_MAINTAINER_TOKEN_PATH = priorTokenPath;
  process.exitCode = priorExitCode;
  spawnState.bomFirstBranchResponse = true;
  vi.restoreAllMocks();
});

describe("workflow-registry live-audit GitHub JSON byte authority", () => {
  it("rejects a UTF-8 BOM instead of normalizing different CLI bytes into valid JSON", async () => {
    process.env.GITHUB_REPOSITORY = "ContextualWisdomLab/noema";
    process.env.NOEMA_MAINTAINER_TOKEN_PATH = delegatedTokenFile();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const report = await main();

    expect(report.status).toBe("FAIL");
    expect(report.failures).toContainEqual(expect.objectContaining({
      code: "workflow_registry_collection_failed",
      detail: expect.stringMatching(/invalid JSON/i),
    }));
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
  });
});
