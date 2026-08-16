import { describe, expect, it, vi } from "vitest";

import { startCli } from "../scripts/actions-runner-assignment-audit.mjs";

describe("runner-assignment CLI defensive error normalization", () => {
  it("fails closed when an injected execution boundary rejects without an Error object", async () => {
    const writeError = vi.fn();
    const setExitCode = vi.fn();

    await expect(startCli({
      execute: async () => { throw null; },
      write_error: writeError,
      set_exit_code: setExitCode,
    })).resolves.toBeUndefined();

    expect(writeError).toHaveBeenCalledWith("runner-assignment audit failed: \n");
    expect(setExitCode).toHaveBeenCalledWith(2);
  });
});
