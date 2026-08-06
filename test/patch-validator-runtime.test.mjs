import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  MAX_PATCH_BYTES,
  MAX_RESULT_JSON_BYTES,
  applyPatchSet,
  copySourceTree,
  parseUnifiedPatch,
  readEnvironment,
  runCli,
  runFixedCommand,
  runValidationCommands,
  validateRepositoryPath,
  writeResultFile,
} from "../patch-validator/runtime.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-patch-runtime-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function environment(overrides = {}) {
  return {
    NOEMA_RESULT_PATH: "/output/result.json",
    NOEMA_REPOSITORY: "ContextualWisdomLab/noema",
    NOEMA_BASE_SHA: "1".repeat(40),
    NOEMA_HEAD_SHA: "2".repeat(40),
    NOEMA_PATCH_SHA256: "3".repeat(64),
    NOEMA_PATCH_PROFILE: "node_patch_verify",
    NOEMA_COMMAND_PROFILE: "node_patch_verify_v1",
    NOEMA_VALIDATOR_IMAGE_DIGEST: `sha256:${"4".repeat(64)}`,
    ...overrides,
  };
}

function modificationPatch({
  path = "src/example.ts",
  oldText = "old value",
  newText = "new value",
  oldStart = 1,
  newStart = 1,
  oldCount = 1,
  newCount = 1,
  noFinalNewline = false,
} = {}) {
  const marker = noFinalNewline ? "\\ No newline at end of file\n" : "";
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      "index 1111111..2222222 100644\n" +
      `--- a/${path}\n` +
      `+++ b/${path}\n` +
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n` +
      `-${oldText}\n${noFinalNewline ? marker : ""}` +
      `+${newText}\n${noFinalNewline ? marker : ""}`,
    "utf8",
  );
}

function creationPatch(path = "src/new.ts", text = "created") {
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      "new file mode 100644\n" +
      "--- /dev/null\n" +
      `+++ b/${path}\n` +
      "@@ -0,0 +1,1 @@\n" +
      `+${text}\n`,
    "utf8",
  );
}

function deletionPatch(path = "src/old.ts", text = "obsolete") {
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      "deleted file mode 100644\n" +
      `--- a/${path}\n` +
      "+++ /dev/null\n" +
      "@@ -1,1 +0,0 @@\n" +
      `-${text}\n`,
    "utf8",
  );
}

describe("environment contract", () => {
  it("accepts only the exact request and image identity", () => {
    expect(readEnvironment(environment())).toEqual({
      resultPath: "/output/result.json",
      repositoryFullName: "ContextualWisdomLab/noema",
      baseSha: "1".repeat(40),
      headSha: "2".repeat(40),
      patchSha256: "3".repeat(64),
      profile: "node_patch_verify",
      commandProfile: "node_patch_verify_v1",
      validatorImageDigest: `sha256:${"4".repeat(64)}`,
    });
  });

  it.each([
    ["NOEMA_RESULT_PATH", "relative/result.json"],
    ["NOEMA_REPOSITORY", "single"],
    ["NOEMA_BASE_SHA", "A".repeat(40)],
    ["NOEMA_HEAD_SHA", "2".repeat(39)],
    ["NOEMA_PATCH_SHA256", "3".repeat(63)],
    ["NOEMA_PATCH_PROFILE", "arbitrary"],
    ["NOEMA_COMMAND_PROFILE", "npm run test"],
    ["NOEMA_VALIDATOR_IMAGE_DIGEST", "4".repeat(64)],
  ])("rejects malformed %s", (key, value) => {
    expect(() => readEnvironment(environment({ [key]: value }))).toThrow(
      /environment/,
    );
  });

  it("rejects missing fields without reflecting values", () => {
    const invalid = environment();
    delete invalid.NOEMA_HEAD_SHA;
    expect(() => readEnvironment(invalid)).toThrow("validator environment");
  });
});

describe("repository paths", () => {
  it.each(["src/example.ts", "test/file name.test.ts", "docs/한국어.md"])(
    "accepts canonical path %s",
    (path) => {
      expect(validateRepositoryPath(path)).toBe(path);
    },
  );

  it.each([
    "",
    "/absolute",
    "../outside",
    "src/../outside",
    "src//double",
    "src/./dot",
    "src/trailing/",
    "src\\windows",
    "src/\u0001control",
    ".git/config",
    "node_modules/package/index.js",
    "package.json",
    "reviewer/agent.py",
    "patch-validator/runtime.mjs",
    ".github/workflows/pwn.yml",
  ])("rejects unsafe or profile-controlled path %s", (path) => {
    expect(() => validateRepositoryPath(path)).toThrow(/path/);
  });
});

describe("unified patch parsing", () => {
  it("parses ordinary modification, creation, and deletion", () => {
    const patches = parseUnifiedPatch(
      Buffer.concat([
        modificationPatch(),
        creationPatch(),
        deletionPatch(),
      ]),
    );
    expect(patches.map(({ operation, path }) => [operation, path])).toEqual([
      ["modify", "src/example.ts"],
      ["create", "src/new.ts"],
      ["delete", "src/old.ts"],
    ]);
    expect(patches[0].hunks[0]).toMatchObject({
      oldStart: 1,
      oldCount: 1,
      newStart: 1,
      newCount: 1,
    });
  });

  it("parses multiple hunks and exact no-final-newline markers", () => {
    const patch = Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n" +
        "--- a/src/example.ts\n" +
        "+++ b/src/example.ts\n" +
        "@@ -1,1 +1,1 @@\n" +
        "-one\n" +
        "+ONE\n" +
        "@@ -3,1 +3,1 @@\n" +
        "-three\n" +
        "\\ No newline at end of file\n" +
        "+THREE\n" +
        "\\ No newline at end of file\n",
    );
    const [parsed] = parseUnifiedPatch(patch);
    expect(parsed.hunks).toHaveLength(2);
    expect(parsed.hunks[1].lines.at(-1)).toMatchObject({
      kind: "add",
      newNoNewline: true,
    });
  });

  it.each([
    Buffer.alloc(0),
    Buffer.from([0xff]),
    Buffer.from("ordinary text\n"),
    Buffer.from(
      "diff --git a/src/old.ts b/src/new.ts\nrename from src/old.ts\nrename to src/new.ts\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\nold mode 100644\nnew mode 100755\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\nGIT binary patch\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n--- a/src/other.ts\n+++ b/src/example.ts\n@@ -1 +1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ malformed\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,2 +1,1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n--- a/src/example.ts\n+++ b/src/example.ts\n@@ -1,1 +1,1 @@\n\\ No newline at end of file\n-old\n+new\n",
    ),
  ])("rejects malformed or unsupported patch input", (patch) => {
    expect(() => parseUnifiedPatch(patch)).toThrow(/patch/);
  });

  it("rejects patch input above the byte ceiling", () => {
    expect(() => parseUnifiedPatch(Buffer.alloc(MAX_PATCH_BYTES + 1))).toThrow(
      /byte limit/,
    );
  });

  it("rejects duplicate target paths", () => {
    expect(() =>
      parseUnifiedPatch(Buffer.concat([modificationPatch(), modificationPatch()])),
    ).toThrow(/duplicate/);
  });
});

describe("patch application", () => {
  it("applies modifications, creations, deletions, and preserves executable mode", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "old value\n");
    writeFileSync(join(root, "src/old.ts"), "obsolete\n");
    chmodSync(join(root, "src/example.ts"), 0o755);

    const patches = parseUnifiedPatch(
      Buffer.concat([modificationPatch(), creationPatch(), deletionPatch()]),
    );
    applyPatchSet(root, patches);

    expect(readFileSync(join(root, "src/example.ts"), "utf8")).toBe(
      "new value\n",
    );
    expect(lstatSync(join(root, "src/example.ts")).mode & 0o111).not.toBe(0);
    expect(readFileSync(join(root, "src/new.ts"), "utf8")).toBe("created\n");
    expect(existsSync(join(root, "src/old.ts"))).toBe(false);
  });

  it("applies separated hunks and a final line without newline", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "one\ntwo\nthree");
    const patch = Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n" +
        "--- a/src/example.ts\n" +
        "+++ b/src/example.ts\n" +
        "@@ -1,1 +1,1 @@\n" +
        "-one\n" +
        "+ONE\n" +
        "@@ -3,1 +3,1 @@\n" +
        "-three\n" +
        "\\ No newline at end of file\n" +
        "+THREE\n" +
        "\\ No newline at end of file\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(readFileSync(join(root, "src/example.ts"), "utf8")).toBe(
      "ONE\ntwo\nTHREE",
    );
  });

  it.each([
    [modificationPatch(), "missing source"],
    [creationPatch(), "target already exists"],
    [deletionPatch(), "missing source"],
  ])("rejects invalid operation state: %s", (patch, expected) => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    if (expected === "target already exists") {
      writeFileSync(join(root, "src/new.ts"), "already\n");
    }
    expect(() => applyPatchSet(root, parseUnifiedPatch(patch))).toThrow(expected);
  });

  it("rejects context mismatch and parent symlink traversal", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "different\n");
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(modificationPatch())),
    ).toThrow(/context/);

    const outside = temporaryRoot();
    symlinkSync(outside, join(root, "linked"), "dir");
    expect(() =>
      applyPatchSet(
        root,
        parseUnifiedPatch(creationPatch("linked/new.ts", "unsafe")),
      ),
    ).toThrow(/symlink/);
  });
});

describe("source materialization", () => {
  it("copies regular files, preserves executable mode, and omits Git metadata", () => {
    const source = temporaryRoot();
    const destination = temporaryRoot();
    mkdirSync(join(source, "src"));
    mkdirSync(join(source, ".git"));
    writeFileSync(join(source, "src/script.js"), "console.log('safe');\n");
    chmodSync(join(source, "src/script.js"), 0o755);

    const receipt = copySourceTree(source, destination);
    expect(receipt).toEqual({ members: 2, totalBytes: 21 });
    expect(existsSync(join(destination, ".git"))).toBe(false);
    expect(lstatSync(join(destination, "src/script.js")).mode & 0o111).not.toBe(
      0,
    );
  });

  it("rejects source symlinks and quota overflow", () => {
    const source = temporaryRoot();
    const destination = temporaryRoot();
    writeFileSync(join(source, "file.txt"), "1234");
    symlinkSync(join(source, "file.txt"), join(source, "link.txt"));
    expect(() => copySourceTree(source, destination)).toThrow(/symlink/);

    rmSync(join(source, "link.txt"));
    expect(() =>
      copySourceTree(source, destination, {
        maximumMembers: 1,
        maximumFileBytes: 3,
        maximumTotalBytes: 3,
      }),
    ).toThrow(/limit/);
  });
});

describe("fixed commands", () => {
  it("runs Node without a shell and returns bounded success output", () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
      error: undefined,
    }));
    const result = runFixedCommand({
      modulePath: "/opt/noema/tool.mjs",
      args: ["run"],
      cwd: "/workspace/source",
      timeoutMs: 1000,
      maximumOutputBytes: 32,
      spawnSyncImpl,
    });
    expect(result).toEqual({
      exitCode: 0,
      stdoutExcerpt: "ok",
      stderrExcerpt: "",
      reasonCodes: [],
    });
    expect(spawnSyncImpl.mock.calls[0][0]).toBe(process.execPath);
    expect(spawnSyncImpl.mock.calls[0][2]).toMatchObject({
      shell: false,
      cwd: "/workspace/source",
      timeout: 1000,
    });
  });

  it.each([
    [
      { status: 2, signal: null, stdout: "", stderr: "failed" },
      "command_failed",
      2,
    ],
    [
      {
        status: null,
        signal: "SIGKILL",
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }),
      },
      "command_timeout",
      124,
    ],
    [
      {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("overflow"), { code: "ENOBUFS" }),
      },
      "command_output_limit",
      125,
    ],
    [
      {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("launch"), { code: "ENOENT" }),
      },
      "command_launch_failed",
      126,
    ],
  ])("classifies command failure", (completed, reason, exitCode) => {
    expect(
      runFixedCommand({
        modulePath: "/opt/noema/tool.mjs",
        args: [],
        cwd: "/workspace/source",
        timeoutMs: 1000,
        maximumOutputBytes: 32,
        spawnSyncImpl: () => completed,
      }),
    ).toMatchObject({ reasonCodes: [reason], exitCode });
  });

  it("runs Vitest only after TypeScript succeeds", () => {
    const calls = [];
    const success = () => ({
      status: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
      error: undefined,
    });
    const result = runValidationCommands("/workspace/source", {
      spawnSyncImpl: (...args) => {
        calls.push(args);
        return success();
      },
      typescriptModule: "/opt/noema/tsc",
      vitestModule: "/opt/noema/vitest",
    });
    expect(result.exitCode).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[0][1][0]).toBe("/opt/noema/tsc");
    expect(calls[1][1][0]).toBe("/opt/noema/vitest");

    calls.length = 0;
    const failed = runValidationCommands("/workspace/source", {
      spawnSyncImpl: (...args) => {
        calls.push(args);
        return {
          status: 1,
          signal: null,
          stdout: "",
          stderr: "type error",
          error: undefined,
        };
      },
      typescriptModule: "/opt/noema/tsc",
      vitestModule: "/opt/noema/vitest",
    });
    expect(failed.exitCode).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe("result channel", () => {
  it("writes bounded JSON only to a pre-created stable regular file", () => {
    const root = temporaryRoot();
    const resultPath = join(root, "result.json");
    writeFileSync(resultPath, "");
    const result = { status: "passed", value: "safe" };
    writeResultFile(resultPath, result);
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual(result);
  });

  it("rejects missing, symlinked, and oversized result channels", () => {
    const root = temporaryRoot();
    const missing = join(root, "missing.json");
    expect(() => writeResultFile(missing, { status: "passed" })).toThrow(
      /result file/,
    );

    const target = join(root, "target.json");
    const link = join(root, "link.json");
    writeFileSync(target, "");
    symlinkSync(target, link);
    expect(() => writeResultFile(link, { status: "passed" })).toThrow(/result file/);

    expect(() =>
      writeResultFile(target, { data: "x".repeat(MAX_RESULT_JSON_BYTES) }),
    ).toThrow(/byte limit/);
  });
});

describe("runtime orchestration", () => {
  function runtimeFixture(patch = modificationPatch()) {
    const root = temporaryRoot();
    const inputRoot = join(root, "input");
    const workspaceRoot = join(root, "workspace");
    const nodeModulesPath = join(root, "image-node-modules");
    const patchPath = join(root, "input.patch");
    const resultPath = join(root, "result.json");
    mkdirSync(join(inputRoot, "src"), { recursive: true });
    mkdirSync(join(inputRoot, ".git"));
    mkdirSync(nodeModulesPath);
    writeFileSync(join(inputRoot, "src/example.ts"), "old value\n");
    writeFileSync(join(inputRoot, "package.json"), '{"type":"module"}\n');
    writeFileSync(join(inputRoot, "package-lock.json"), "{}\n");
    writeFileSync(join(inputRoot, "tsconfig.json"), "{}\n");
    writeFileSync(join(inputRoot, "vitest.config.ts"), "export default {};\n");
    writeFileSync(patchPath, patch);
    writeFileSync(resultPath, "");
    return {
      inputRoot,
      workspaceRoot,
      nodeModulesPath,
      patchPath,
      resultPath,
    };
  }

  it("materializes, patches, validates, and emits exact passed evidence", () => {
    const fixture = runtimeFixture();
    const result = runCli({
      env: environment(),
      ...fixture,
      now: (() => {
        const times = [1000, 1010];
        return () => times.shift();
      })(),
      spawnSyncImpl: () => ({
        status: 0,
        signal: null,
        stdout: "passed",
        stderr: "",
        error: undefined,
      }),
    });
    expect(result).toMatchObject({
      status: "passed",
      exit_code: 0,
      duration_ms: 10,
      validator_image_digest: environment().NOEMA_VALIDATOR_IMAGE_DIGEST,
    });
    expect(JSON.parse(readFileSync(fixture.resultPath, "utf8"))).toEqual(result);
    expect(
      readFileSync(join(fixture.workspaceRoot, "source/src/example.ts"), "utf8"),
    ).toBe("new value\n");
    expect(lstatSync(join(fixture.workspaceRoot, "source/node_modules")).isSymbolicLink()).toBe(
      true,
    );
  });

  it("emits failed evidence for a fixed validation-command failure", () => {
    const fixture = runtimeFixture();
    const result = runCli({
      env: environment(),
      ...fixture,
      spawnSyncImpl: () => ({
        status: 7,
        signal: null,
        stdout: "",
        stderr: "failed",
        error: undefined,
      }),
    });
    expect(result).toMatchObject({
      status: "failed",
      exit_code: 7,
      reason_codes: ["command_failed"],
    });
  });

  it("emits blocked evidence for malformed or inapplicable patch bytes", () => {
    const fixture = runtimeFixture(Buffer.from("not a patch"));
    const result = runCli({
      env: environment(),
      ...fixture,
      spawnSyncImpl: vi.fn(),
    });
    expect(result.status).toBe("blocked");
    expect(result.reason_codes).toEqual(["patch_blocked"]);
    expect(result.stderr_excerpt).toMatch(/patch/);
  });

  it("rejects an invalid environment before touching the result channel", () => {
    const fixture = runtimeFixture();
    const invalid = environment({ NOEMA_PATCH_PROFILE: "arbitrary" });
    expect(() => runCli({ env: invalid, ...fixture })).toThrow(/environment/);
    expect(readFileSync(fixture.resultPath, "utf8")).toBe("");
  });
});
