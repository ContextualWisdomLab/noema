import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const entrypointPath = resolve(
  import.meta.dirname,
  "../patch-validator/validate-patch.mjs",
);

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
});
