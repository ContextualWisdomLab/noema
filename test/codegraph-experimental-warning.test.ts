import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const PACKAGE = JSON.parse(readFileSync("package.json", "utf8")) as {
  devEngines?: { runtime?: { version?: string } };
};
const RUNNER_PATHS = [
  ".github/codegraph/sandbox-runner.mjs",
  ".github/codegraph/sandbox-node-runner.mjs",
] as const;

describe("CodeGraph SQLite warning boundary", () => {
  it("proves the canonical hosted Node line loads node:sqlite without ExperimentalWarning", () => {
    expect(PACKAGE.devEngines?.runtime?.version).toBe("24.19.0");

    const probe = spawnSync(
      process.execPath,
      ["--input-type=module", "--eval", "await import('node:sqlite')"],
      { encoding: "utf8" },
    );

    expect(probe.status).toBe(0);
    expect(probe.stderr).not.toContain("ExperimentalWarning");
    expect(probe.stderr).not.toContain("SQLite is an experimental feature");
  });

  it.each(RUNNER_PATHS)(
    "%s keeps ExperimentalWarning visible instead of suppressing it",
    (runnerPath) => {
      const source = readFileSync(runnerPath, "utf8");

      expect(source).toContain('"--liftoff-only"');
      expect(source).not.toContain("--disable-warning=ExperimentalWarning");
    },
  );
});
