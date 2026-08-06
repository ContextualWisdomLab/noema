import { describe, expect, it, vi } from "vitest";

import { runValidationCommands } from "../patch-validator/runtime.mjs";

describe("patch-validator Vitest config isolation", () => {
  it("uses the runner config loader so read-only image dependencies are not mutated", () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: "",
      stderr: "",
      error: undefined,
    }));

    const result = runValidationCommands("/workspace/source", {
      spawnSyncImpl,
      typescriptModule: "/opt/noema/node_modules/typescript/bin/tsc",
      vitestModule: "/opt/noema/node_modules/vitest/vitest.mjs",
    });

    expect(result.exitCode).toBe(0);
    expect(spawnSyncImpl).toHaveBeenCalledTimes(2);
    expect(spawnSyncImpl.mock.calls[1][1]).toEqual([
      "/opt/noema/node_modules/vitest/vitest.mjs",
      "run",
      "--coverage",
      "--configLoader",
      "runner",
      "--config",
      "/workspace/source/vitest.config.ts",
    ]);
  });
});
