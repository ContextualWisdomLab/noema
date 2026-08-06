import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { runCli } from "../patch-validator/runtime.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-result-isolation-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function modificationPatch() {
  return Buffer.from(
    "diff --git a/src/example.ts b/src/example.ts\n" +
      "index 1111111..2222222 100644\n" +
      "--- a/src/example.ts\n" +
      "+++ b/src/example.ts\n" +
      "@@ -1 +1 @@\n" +
      "-old value\n" +
      "+new value\n",
  );
}

function exactEnvironment(patchBytes, resultPath) {
  return {
    NOEMA_RESULT_PATH: resultPath,
    NOEMA_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_BASE_SHA: "1".repeat(40),
    NOEMA_HEAD_SHA: "2".repeat(40),
    NOEMA_PATCH_SHA256: createHash("sha256").update(patchBytes).digest("hex"),
    NOEMA_PATCH_PROFILE: "node_patch_verify",
    NOEMA_COMMAND_PROFILE: "node_patch_verify_v1",
    NOEMA_VALIDATOR_IMAGE_DIGEST: `sha256:${"4".repeat(64)}`,
  };
}

function runtimeFixture() {
  const root = temporaryRoot();
  const inputRoot = join(root, "input");
  const workspaceRoot = join(root, "workspace");
  const nodeModulesPath = join(root, "image-node-modules");
  const patchPath = join(root, "input.patch");
  const patchBytes = modificationPatch();

  mkdirSync(join(inputRoot, "src"), { recursive: true });
  mkdirSync(join(inputRoot, ".git"));
  mkdirSync(nodeModulesPath);
  writeFileSync(join(inputRoot, "src/example.ts"), "old value\n");
  writeFileSync(join(inputRoot, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(inputRoot, "package-lock.json"), "{}\n");
  writeFileSync(join(inputRoot, "tsconfig.json"), "{}\n");
  writeFileSync(join(inputRoot, "vitest.config.ts"), "export default {};\n");
  writeFileSync(patchPath, patchBytes);

  return {
    root,
    inputRoot,
    workspaceRoot,
    nodeModulesPath,
    patchPath,
    patchBytes,
  };
}

function successfulCommand() {
  return {
    status: 0,
    signal: null,
    stdout: "",
    stderr: "",
    error: undefined,
  };
}

describe("internal result isolation", () => {
  it("creates its tmpfs result file without a host-writable mount", () => {
    const fixture = runtimeFixture();
    const resultPath = join(fixture.workspaceRoot, "result.json");

    expect(existsSync(resultPath)).toBe(false);
    const result = runCli({
      env: exactEnvironment(fixture.patchBytes, resultPath),
      inputRoot: fixture.inputRoot,
      patchPath: fixture.patchPath,
      workspaceRoot: fixture.workspaceRoot,
      nodeModulesPath: fixture.nodeModulesPath,
      spawnSyncImpl: successfulCommand,
    });

    expect(result.status).toBe("passed");
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual(result);
  });

  it("prefers an explicit private result path over an environment path", () => {
    const fixture = runtimeFixture();
    const environmentResultPath = join(fixture.root, "untrusted-result.json");
    const explicitResultPath = join(fixture.workspaceRoot, "trusted-result.json");

    const result = runCli({
      env: exactEnvironment(fixture.patchBytes, environmentResultPath),
      resultPath: explicitResultPath,
      inputRoot: fixture.inputRoot,
      patchPath: fixture.patchPath,
      workspaceRoot: fixture.workspaceRoot,
      nodeModulesPath: fixture.nodeModulesPath,
      spawnSyncImpl: successfulCommand,
    });

    expect(result.status).toBe("passed");
    expect(existsSync(environmentResultPath)).toBe(false);
    expect(JSON.parse(readFileSync(explicitResultPath, "utf8"))).toEqual(result);
  });

  it("uses the process environment when no environment map is supplied", () => {
    const fixture = runtimeFixture();
    const resultPath = join(fixture.workspaceRoot, "process-environment-result.json");
    for (const [name, value] of Object.entries(
      exactEnvironment(fixture.patchBytes, resultPath),
    )) {
      vi.stubEnv(name, value);
    }

    const result = runCli({
      inputRoot: fixture.inputRoot,
      patchPath: fixture.patchPath,
      workspaceRoot: fixture.workspaceRoot,
      nodeModulesPath: fixture.nodeModulesPath,
      spawnSyncImpl: successfulCommand,
    });

    expect(result.status).toBe("passed");
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual(result);
  });
});
