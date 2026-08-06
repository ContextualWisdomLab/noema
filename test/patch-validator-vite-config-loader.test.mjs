import { describe, expect, it, vi } from "vitest";

import { runValidationCommands } from "../patch-validator/runtime.mjs";

describe("patch-validator Vitest config isolation", () => {
  it("uses the runner loader and image-owned config without mutating dependencies", () => {
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
      "--root",
      "/workspace/source",
      "--configLoader",
      "runner",
      "--config",
      "/opt/noema/validator-vitest.config.mjs",
    ]);
  });
});
