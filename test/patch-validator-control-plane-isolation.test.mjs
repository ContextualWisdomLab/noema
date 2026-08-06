import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { runValidationCommands } from "../patch-validator/runtime.mjs";

const TYPESCRIPT_MODULE = "/opt/noema/node_modules/typescript/bin/tsc";
const VITEST_MODULE = "/opt/noema/node_modules/vitest/vitest.mjs";
const TRUSTED_TYPESCRIPT_CONFIG = "/opt/noema/validator-tsconfig.json";
const TRUSTED_VITEST_CONFIG = "/opt/noema/validator-vitest.config.mjs";

describe("patch-validator control-plane isolation", () => {
  it("never loads validation policy from the untrusted source tree", () => {
    const sourceRoot = "/workspace/source";
    const invocations = [];

    const result = runValidationCommands(sourceRoot, {
      spawnSyncImpl: (command, argumentsList, options) => {
        invocations.push({ command, argumentsList, options });
        return {
          status: 0,
          signal: null,
          stdout: "",
          stderr: "",
          error: undefined,
        };
      },
    });

    expect(result.exitCode).toBe(0);
    expect(invocations).toHaveLength(2);
    expect(invocations[0].argumentsList).toEqual([
      TYPESCRIPT_MODULE,
      "--noEmit",
      "--project",
      TRUSTED_TYPESCRIPT_CONFIG,
    ]);
    expect(invocations[1].argumentsList).toEqual([
      VITEST_MODULE,
      "run",
      "--coverage",
      "--root",
      sourceRoot,
      "--configLoader",
      "runner",
      "--config",
      TRUSTED_VITEST_CONFIG,
    ]);
    for (const invocation of invocations) {
      expect(invocation.argumentsList).not.toContain(
        `${sourceRoot}/tsconfig.json`,
      );
      expect(invocation.argumentsList).not.toContain(
        `${sourceRoot}/vitest.config.ts`,
      );
    }
  });

  it("copies immutable image-owned validation configurations into the runtime", () => {
    const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");
    const dockerignore = readFileSync(
      "Dockerfile.patch-validator.dockerignore",
      "utf8",
    );

    expect(dockerfile).toContain(
      "COPY --chown=65532:65532 patch-validator/validator-tsconfig.json /opt/noema/validator-tsconfig.json",
    );
    expect(dockerfile).toContain(
      "COPY --chown=65532:65532 patch-validator/validator-vitest.config.mjs /opt/noema/validator-vitest.config.mjs",
    );
    expect(dockerignore).toContain(
      "!patch-validator/validator-tsconfig.json",
    );
    expect(dockerignore).toContain(
      "!patch-validator/validator-vitest.config.mjs",
    );
  });
});
