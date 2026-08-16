import { describe, expect, it } from "vitest";
import { ghApi } from "../scripts/actions-runner-assignment-audit.mjs";

const apiPath = "repos/ContextualWisdomLab/noema/actions/runs/100";
const activeToken = "github_pat_noema_runner_audit_secret_123";
const runtimeEnvironment = { PATH: "/usr/bin", GH_TOKEN: activeToken };

describe("runner-assignment GitHub credential redaction", () => {
  it("redacts the active credential from spawn errors before they can reach retained output", () => {
    let thrown: unknown;
    try {
      ghApi(apiPath, {}, {
        spawn_sync: () => ({
          error: new Error(`spawn failed while using ${activeToken}`),
          status: null,
          stdout: Buffer.alloc(0),
          stderr: Buffer.alloc(0),
        }),
        environment: runtimeEnvironment,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("[REDACTED]");
    expect((thrown as Error).message).not.toContain(activeToken);
  });

  it("redacts the active credential from nonzero gh stderr before it can reach retained output", () => {
    let thrown: unknown;
    try {
      ghApi(apiPath, {}, {
        spawn_sync: () => ({
          error: undefined,
          status: 7,
          stdout: Buffer.alloc(0),
          stderr: Buffer.from(`request failed for token ${activeToken}\n`, "utf8"),
        }),
        environment: runtimeEnvironment,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toContain("[REDACTED]");
    expect((thrown as Error).message).not.toContain(activeToken);
  });

  it("keeps a nonzero gh failure bounded when the runtime supplies no stderr bytes", () => {
    let thrown: unknown;
    try {
      ghApi(apiPath, {}, {
        spawn_sync: () => ({
          error: undefined,
          status: 7,
          stdout: Buffer.alloc(0),
          stderr: undefined,
        }),
        environment: runtimeEnvironment,
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).message).toBe("GitHub Actions evidence read failed with gh exit 7:");
    expect((thrown as Error).message).not.toContain(activeToken);
  });
});
