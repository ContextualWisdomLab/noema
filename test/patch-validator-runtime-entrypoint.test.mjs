import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const validatorPath = resolve(
  import.meta.dirname,
  "../patch-validator/validate-patch.mjs",
);
const validatorUrl = pathToFileURL(validatorPath).href;
const executableSource = [
  `import { runCli } from ${JSON.stringify(validatorUrl)};`,
  "const result = runCli();",
  'if (result.status !== "passed") {',
  "  process.exitCode = Number.isInteger(result.exit_code) && result.exit_code > 0",
  "    ? result.exit_code",
  "    : 1;",
  "}",
].join("\n");

describe("patch-validator executable entrypoint", () => {
  it("executes fail-closed validation instead of silently exiting", () => {
    const completed = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", executableSource],
      {
        encoding: "utf8",
        env: {},
        shell: false,
      },
    );

    expect(completed.status).not.toBe(0);
    expect(completed.stderr).toMatch(/environment/);
  });
});
