import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  executeEntrypointIfRequested,
  main,
} from "../patch-validator/validate-patch.mjs";

const entrypointPath = resolve(
  import.meta.dirname,
  "../patch-validator/validate-patch.mjs",
);
const originalExitCode = process.exitCode;

afterEach(() => {
  process.exitCode = originalExitCode;
});

describe("patch-validator executable entrypoint", () => {
  it("executes fail-closed validation instead of silently exiting", () => {
    const completed = spawnSync(process.execPath, [entrypointPath], {
      encoding: "utf8",
      env: {},
      shell: false,
    });

    expect(completed.status).not.toBe(0);
    expect(completed.stderr).toMatch(/environment/);
  });

  it("returns the exact passed result without setting a failure exit code", () => {
    const passed = { status: "passed", exit_code: 0 };
    process.exitCode = undefined;
    expect(main(() => passed)).toBe(passed);
    expect(process.exitCode).toBeUndefined();
  });

  it.each([
    [{ status: "failed", exit_code: 7 }, 7],
    [{ status: "blocked", exit_code: 0 }, 1],
  ])("sets a fail-closed exit code for %s", (result, expectedExitCode) => {
    process.exitCode = undefined;
    expect(main(() => result)).toBe(result);
    expect(process.exitCode).toBe(expectedExitCode);
  });

  it("does not execute for a missing or different process entry path", () => {
    const runCliImpl = vi.fn();
    expect(
      executeEntrypointIfRequested({
        argv: [process.execPath],
        moduleUrl: pathToFileURL(entrypointPath).href,
        runCliImpl,
      }),
    ).toBeNull();
    expect(
      executeEntrypointIfRequested({
        argv: [process.execPath, resolve(import.meta.dirname, "other.mjs")],
        moduleUrl: pathToFileURL(entrypointPath).href,
        runCliImpl,
      }),
    ).toBeNull();
    expect(runCliImpl).not.toHaveBeenCalled();
  });

  it("executes exactly once for the direct module path", () => {
    const passed = { status: "passed", exit_code: 0 };
    const runCliImpl = vi.fn(() => passed);
    expect(
      executeEntrypointIfRequested({
        argv: [process.execPath, entrypointPath],
        moduleUrl: pathToFileURL(entrypointPath).href,
        runCliImpl,
      }),
    ).toBe(passed);
    expect(runCliImpl).toHaveBeenCalledOnce();
  });
});
