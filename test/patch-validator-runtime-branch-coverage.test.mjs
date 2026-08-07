import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applyPatchSet,
  parseUnifiedPatch,
  readEnvironment,
  runCli,
} from "../patch-validator/runtime.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-patch-branch-coverage-"));
  roots.push(root);
  return root;
}

function modificationPatch() {
  return Buffer.from(
    "diff --git a/src/example.ts b/src/example.ts\n" +
      "--- a/src/example.ts\n" +
      "+++ b/src/example.ts\n" +
      "@@ -1 +1 @@\n" +
      "-old value\n" +
      "+new value\n",
  );
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function environment(patchBytes, overrides = {}) {
  return {
    NOEMA_RESULT_PATH: "/output/result.json",
    NOEMA_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_BASE_SHA: "1".repeat(40),
    NOEMA_HEAD_SHA: "2".repeat(40),
    NOEMA_PATCH_SHA256: digest(patchBytes),
    NOEMA_PATCH_PROFILE: "node_patch_verify",
    NOEMA_COMMAND_PROFILE: "node_patch_verify_v1",
    NOEMA_VALIDATOR_IMAGE_DIGEST: `sha256:${"4".repeat(64)}`,
    ...overrides,
  };
}

function runtimeFixture() {
  const root = temporaryRoot();
  const patchBytes = modificationPatch();
  const inputRoot = join(root, "input");
  const workspaceRoot = join(root, "workspace");
  const nodeModulesPath = join(root, "image-node-modules");
  const patchPath = join(root, "input.patch");
  const resultPath = join(root, "result.json");
  mkdirSync(join(inputRoot, "src"), { recursive: true });
  mkdirSync(nodeModulesPath);
  writeFileSync(join(inputRoot, "src/example.ts"), "old value\n");
  writeFileSync(join(inputRoot, "package.json"), '{"type":"module"}\n');
  writeFileSync(join(inputRoot, "package-lock.json"), "{}\n");
  writeFileSync(join(inputRoot, "tsconfig.json"), "{}\n");
  writeFileSync(join(inputRoot, "vitest.config.ts"), "export default {};\n");
  writeFileSync(patchPath, patchBytes);
  writeFileSync(resultPath, "");
  return {
    patchBytes,
    inputRoot,
    workspaceRoot,
    nodeModulesPath,
    patchPath,
    resultPath,
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

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.resetModules();
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe("remaining runtime branches", () => {
  it("rejects an omitted new file header", () => {
    const patch = Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n" +
        "--- a/src/x.ts\n",
    );
    expect(() => parseUnifiedPatch(patch)).toThrow(/incomplete file path metadata/);
  });

  it("defaults an unannotated created file to mode 100644", () => {
    const patch = Buffer.from(
      "diff --git a/src/default.ts b/src/default.ts\n" +
        "--- /dev/null\n" +
        "+++ b/src/default.ts\n" +
        "@@ -0,0 +1 @@\n" +
        "+created\n",
    );
    expect(parseUnifiedPatch(patch)[0]).toMatchObject({
      operation: "create",
      mode: "100644",
    });
  });

  it("applies the executable branch for mode 100755", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "bin"));
    const patch = Buffer.from(
      "diff --git a/bin/tool.mjs b/bin/tool.mjs\n" +
        "new file mode 100755\n" +
        "--- /dev/null\n" +
        "+++ b/bin/tool.mjs\n" +
        "@@ -0,0 +1 @@\n" +
        "+export {};\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(lstatSync(join(root, "bin/tool.mjs")).mode & 0o111).not.toBe(0);
  });

  it("rejects an omitted validator image digest after all prior identity fields pass", () => {
    const patchBytes = modificationPatch();
    const raw = environment(patchBytes);
    delete raw.NOEMA_VALIDATOR_IMAGE_DIGEST;
    expect(() => readEnvironment(raw)).toThrow(/environment/);
  });

  it("closes no descriptor when opening the result channel fails", async () => {
    const actual = await vi.importActual("node:fs");
    vi.resetModules();
    vi.doMock("node:fs", () => ({
      ...actual,
      openSync() {
        throw new Error("forced result open failure");
      },
    }));
    const { writeResultFile } = await import("../patch-validator/validate-patch.mjs");
    const root = temporaryRoot();
    const resultPath = join(root, "result.json");
    writeFileSync(resultPath, "");
    expect(() => writeResultFile(resultPath, { status: "passed" })).toThrow(
      /forced result open failure/,
    );
  });

  it("uses the identity result path when no explicit override is supplied", () => {
    const fixture = runtimeFixture();
    const result = runCli({
      env: environment(fixture.patchBytes, {
        NOEMA_RESULT_PATH: fixture.resultPath,
      }),
      inputRoot: fixture.inputRoot,
      workspaceRoot: fixture.workspaceRoot,
      nodeModulesPath: fixture.nodeModulesPath,
      patchPath: fixture.patchPath,
      spawnSyncImpl: successfulCommand,
    });
    expect(result.status).toBe("passed");
    expect(JSON.parse(readFileSync(fixture.resultPath, "utf8"))).toEqual(result);
  });

  it("bounds a non-Error validation failure without losing its message", () => {
    const fixture = runtimeFixture();
    const result = runCli({
      env: environment(fixture.patchBytes),
      inputRoot: fixture.inputRoot,
      workspaceRoot: fixture.workspaceRoot,
      nodeModulesPath: fixture.nodeModulesPath,
      patchPath: fixture.patchPath,
      resultPath: fixture.resultPath,
      spawnSyncImpl() {
        throw "non-error validation failure";
      },
    });
    expect(result).toMatchObject({
      status: "blocked",
      reason_codes: ["patch_blocked"],
      stderr_excerpt: "non-error validation failure",
    });
  });
});
