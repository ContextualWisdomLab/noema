import { afterEach, describe, expect, it } from "vitest";
import {
  ghApi,
  startCli,
} from "../scripts/actions-runner-assignment-audit.mjs";

const originalExitCode = process.exitCode;
const originalGithubToken = process.env.GH_TOKEN;
const originalMaintainerTokenPath = process.env.NOEMA_MAINTAINER_TOKEN_PATH;

afterEach(() => {
  process.exitCode = originalExitCode;
  if (originalGithubToken === undefined) delete process.env.GH_TOKEN;
  else process.env.GH_TOKEN = originalGithubToken;
  if (originalMaintainerTokenPath === undefined) delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
  else process.env.NOEMA_MAINTAINER_TOKEN_PATH = originalMaintainerTokenPath;
});

describe("runner-assignment production boundary coverage", () => {
  it("bounds non-string GitHub CLI spawn diagnostics without leaking ambient state", () => {
    expect(() => ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/1",
      {},
      {
        environment: { PATH: "/usr/bin", GH_TOKEN: "read-only-token" },
        spawn_sync: () => ({
          error: { message: undefined },
          status: null,
          stdout: new Uint8Array(),
          stderr: new Uint8Array(),
        }),
      },
    )).toThrow(/GitHub Actions evidence read failed/i);
  });

  it("uses the production process environment only when an injected runtime omits one", () => {
    process.env.GH_TOKEN = "read-only-process-token";
    const observedEnvironments: Array<Record<string, string>> = [];

    const result = ghApi(
      "repos/ContextualWisdomLab/noema/actions/runs/2",
      {},
      {
        spawn_sync: (_command: string, _args: string[], options: { env: Record<string, string> }) => {
          observedEnvironments.push(options.env);
          return {
            status: 0,
            stdout: new TextEncoder().encode('{"id":2}'),
            stderr: new Uint8Array(),
          };
        },
      },
    );

    expect(result).toEqual({ id: 2 });
    expect(observedEnvironments).toHaveLength(1);
    expect(observedEnvironments[0]).toEqual({
      PATH: process.env.PATH,
      GH_TOKEN: "read-only-process-token",
      GH_HOST: "github.com",
      NO_COLOR: "1",
    });
  });

  it("uses the production audit entrypoint and fails closed before GitHub I/O without a delegated capability path", async () => {
    const previousExitCode = process.exitCode;
    const previousToken = process.env.GH_TOKEN;
    const previousTokenPath = process.env.NOEMA_MAINTAINER_TOKEN_PATH;
    const errors: string[] = [];
    const exitCodes: number[] = [];
    try {
      delete process.env.GH_TOKEN;
      delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      const result = await startCli({
        write_error: (value: string) => errors.push(value),
        set_exit_code: (code: number) => exitCodes.push(code),
      });

      expect(result).toBeUndefined();
      expect(errors).toHaveLength(1);
      expect(errors[0]).toMatch(/Maintainer token file path is required/i);
      expect(exitCodes).toEqual([2]);
    } finally {
      process.exitCode = previousExitCode;
      if (previousToken === undefined) delete process.env.GH_TOKEN;
      else process.env.GH_TOKEN = previousToken;
      if (previousTokenPath === undefined) delete process.env.NOEMA_MAINTAINER_TOKEN_PATH;
      else process.env.NOEMA_MAINTAINER_TOKEN_PATH = previousTokenPath;
    }
  });

  it("uses the production stderr and exit-code boundaries for an unhandled CLI failure", async () => {
    const previousExitCode = process.exitCode;
    try {
      const result = await startCli({
        execute: async () => {
          throw new Error("synthetic production-boundary failure");
        },
      });

      expect(result).toBeUndefined();
      expect(process.exitCode).toBe(2);
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
