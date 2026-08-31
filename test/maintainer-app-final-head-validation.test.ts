import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const repository = "ContextualWisdomLab/noema";
const originalEnvironment = { ...process.env };
const originalExitCode = process.exitCode;
const directories: string[] = [];

function restoreProcessState(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  vi.doUnmock("node:child_process");
  vi.resetModules();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
}

afterEach(() => restoreProcessState());

describe("Maintainer App final protected-main revision validation", () => {
  it("fails closed when the final default-branch lookup returns a noncanonical SHA", async () => {
    let mainCommitLookupCount = 0;
    vi.doMock("node:child_process", () => ({
      spawnSync: (_command: string, args: string[]) => {
        const endpoint = args.at(-1) || "";
        let payload: unknown = {};
        if (endpoint.includes("installation/repositories")) {
          payload = [{ repositories: [{ full_name: repository }] }];
        } else if (endpoint.includes("users/noema-maintainer")) {
          payload = { login: "noema-maintainer[bot]", type: "Bot" };
        } else if (endpoint.includes("users/noema-reviewer")) {
          payload = { login: "noema-reviewer[bot]", type: "Bot" };
        } else if (endpoint === `repos/${repository}`) {
          payload = {
            default_branch: "main",
            permissions: { pull: true, push: true, admin: false, maintain: false, triage: false },
          };
        } else if (endpoint === `repos/${repository}/commits/main`) {
          mainCommitLookupCount += 1;
          payload = { sha: mainCommitLookupCount === 1 ? "a".repeat(40) : "not-a-canonical-sha" };
        } else if (endpoint.includes("/rules/branches/main")) {
          payload = [[]];
        }
        return {
          status: 0,
          error: undefined,
          stdout: Buffer.from(JSON.stringify(payload), "utf8"),
          stderr: Buffer.alloc(0),
        };
      },
    }));

    const directory = mkdtempSync(join(tmpdir(), "noema-maintainer-final-head-"));
    directories.push(directory);
    const tokenPath = join(directory, "token");
    const governancePath = join(directory, "governance.json");
    writeFileSync(tokenPath, "delegated-token", { encoding: "utf8", mode: 0o600 });
    writeFileSync(governancePath, '{"status":"PASS"}\n', "utf8");
    Object.assign(process.env, {
      GITHUB_REPOSITORY: repository,
      NOEMA_MAINTAINER_TOKEN_PATH: tokenPath,
      NOEMA_MAINTAINER_APP_SLUG: "noema-maintainer",
      NOEMA_MAINTAINER_INSTALLATION_ID: "123456",
      NOEMA_REVIEWER_APP_SLUG: "noema-reviewer",
      NOEMA_REVIEWER_INSTALLATION_ID: "654321",
      NOEMA_REVIEWER_LOGIN: "noema-reviewer[bot]",
      NOEMA_MAINTENANCE_ENABLED: "false",
      NOEMA_MAINTAINER_READINESS_PATH: join(directory, "readiness.json"),
      NOEMA_GOVERNANCE_AUDIT_PATH: governancePath,
    });
    delete process.env.GITHUB_OUTPUT;
    delete process.env.GITHUB_STEP_SUMMARY;

    const subject = await import("../scripts/maintainer-app-readiness.mjs");
    const report = subject.main();
    process.exitCode = originalExitCode;

    expect(mainCommitLookupCount).toBe(2);
    expect(report.status).toBe("FAIL");
    expect(report.failures).toEqual([
      expect.objectContaining({
        code: "collection_failed",
        detail: "Final default-branch commit lookup did not provide a canonical SHA.",
      }),
    ]);
  });
});
