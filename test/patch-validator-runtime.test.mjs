import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
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

import { afterEach, describe, expect, it, vi } from "vitest";

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
  const root = mkdtempSync(join(tmpdir(), "noema-patch-validator-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.restoreAllMocks();
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

function modificationPatch({
  path = "src/example.ts",
  oldText = "old value",
  newText = "new value",
  oldStart = 1,
  newStart = 1,
  oldCount = 1,
  newCount = 1,
  finalNewline = true,
} = {}) {
  const marker = finalNewline ? "" : "\\ No newline at end of file\n";
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      "index 1111111..2222222 100644\n" +
      `--- a/${path}\n` +
      `+++ b/${path}\n` +
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n` +
      `-${oldText}\n${marker}` +
      `+${newText}\n${marker}`,
  );
}

function creationPatch(path = "src/new.ts", text = "created", mode = "100644") {
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      `new file mode ${mode}\n` +
      "--- /dev/null\n" +
      `+++ b/${path}\n` +
      "@@ -0,0 +1,1 @@\n" +
      `+${text}\n`,
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
  );
}

function digest(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function environment(patchBytes = modificationPatch(), overrides = {}) {
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

function runtimeFixture(patchBytes = modificationPatch()) {
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

describe("environment identity", () => {
  it("accepts the exact request and immutable image digest", () => {
    const raw = environment();
    expect(readEnvironment(raw)).toEqual({
      resultPath: raw.NOEMA_RESULT_PATH,
      repositoryFullName: raw.NOEMA_REPOSITORY,
      baseSha: raw.NOEMA_BASE_SHA,
      headSha: raw.NOEMA_HEAD_SHA,
      patchSha256: raw.NOEMA_PATCH_SHA256,
      profile: raw.NOEMA_PATCH_PROFILE,
      commandProfile: raw.NOEMA_COMMAND_PROFILE,
      validatorImageDigest: raw.NOEMA_VALIDATOR_IMAGE_DIGEST,
    });
  });

  it.each([
    ["NOEMA_RESULT_PATH", "relative.json"],
    ["NOEMA_REPOSITORY", "single"],
    ["NOEMA_BASE_SHA", "A".repeat(40)],
    ["NOEMA_HEAD_SHA", "2".repeat(39)],
    ["NOEMA_PATCH_SHA256", "3".repeat(63)],
    ["NOEMA_PATCH_PROFILE", "arbitrary"],
    ["NOEMA_COMMAND_PROFILE", "npm run test"],
    ["NOEMA_VALIDATOR_IMAGE_DIGEST", "4".repeat(64)],
  ])("rejects malformed %s", (key, value) => {
    expect(() => readEnvironment(environment(undefined, { [key]: value }))).toThrow(
      /environment/,
    );
  });

  it("rejects an omitted identity field", () => {
    const raw = environment();
    delete raw.NOEMA_HEAD_SHA;
    expect(() => readEnvironment(raw)).toThrow(/environment/);
  });
});

describe("path policy", () => {
  it.each(["src/example.ts", "test/file name.test.ts", "docs/한국어.md"])(
    "accepts canonical path %s",
    (path) => expect(validateRepositoryPath(path)).toBe(path),
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
    ".git",
    ".git/config",
    "node_modules",
    "node_modules/pkg/index.js",
    "package.json",
    "reviewer/agent.py",
    "patch-validator/runtime.mjs",
    ".github/workflows/pwn.yml",
  ])("rejects unsafe or controlled path %s", (path) => {
    expect(() => validateRepositoryPath(path)).toThrow(/path/);
  });
});

describe("strict patch parser", () => {
  it("parses modification, creation, deletion, and executable creation", () => {
    const patches = parseUnifiedPatch(
      Buffer.concat([
        modificationPatch(),
        creationPatch(),
        deletionPatch(),
        creationPatch("bin/tool.mjs", "run", "100755"),
      ]),
    );
    expect(patches.map(({ operation, path, mode }) => [operation, path, mode])).toEqual([
      ["modify", "src/example.ts", null],
      ["create", "src/new.ts", "100644"],
      ["delete", "src/old.ts", "100644"],
      ["create", "bin/tool.mjs", "100755"],
    ]);
  });

  it("parses quoted paths, multiple hunks, context, and no-newline markers", () => {
    const patch = Buffer.from(
      'diff --git "a/src/example.ts" "b/src/example.ts"\n' +
        '--- "a/src/example.ts"\n' +
        '+++ "b/src/example.ts"\n' +
        "@@ -1,2 +1,2 @@\n" +
        "-one\n" +
        "+ONE\n" +
        " two\n" +
        "@@ -3,1 +3,1 @@ trailing\n" +
        "-three\n" +
        "\\ No newline at end of file\n" +
        "+THREE\n" +
        "\\ No newline at end of file\n",
    );
    const [parsed] = parseUnifiedPatch(patch);
    expect(parsed.hunks).toHaveLength(2);
    expect(parsed.hunks[0].lines[2]).toMatchObject({ kind: "context", text: "two" });
    expect(parsed.hunks[1].lines[0].oldNoNewline).toBe(true);
    expect(parsed.hunks[1].lines[1].newNoNewline).toBe(true);
  });

  it.each([
    Buffer.alloc(0),
    new Uint8Array([1]),
    Buffer.from([0xff]),
    Buffer.from("ordinary text\n"),
    Buffer.from("diff --git malformed\n"),
    Buffer.from(
      "diff --git a/src/old.ts b/src/new.ts\n--- a/src/old.ts\n+++ b/src/new.ts\n@@ -1 +1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nrename from src/x.ts\nrename to src/y.ts\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nold mode 100644\nnew mode 100755\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nGIT binary patch\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/y.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/y.ts\n@@ -1 +1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- /dev/null\n+++ /dev/null\n@@ -0,0 +0,0 @@\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nnew file mode 100644\ndeleted file mode 100644\n--- /dev/null\n+++ b/src/x.ts\n@@ -0,0 +1 @@\n+x\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nnew file mode 100644\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ malformed\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1,2 +1,1 @@\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n\\ No newline at end of file\n-old\n+new\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\nnot a hunk\n",
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-old\n+new\ntrailing\n",
    ),
  ])("rejects malformed or unsupported input", (patch) => {
    expect(() => parseUnifiedPatch(patch)).toThrow(/patch/);
  });

  it("rejects oversized and duplicate patches", () => {
    expect(() => parseUnifiedPatch(Buffer.alloc(MAX_PATCH_BYTES + 1))).toThrow(
      /byte limit/,
    );
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

    applyPatchSet(
      root,
      parseUnifiedPatch(
        Buffer.concat([modificationPatch(), creationPatch(), deletionPatch()]),
      ),
    );

    expect(readFileSync(join(root, "src/example.ts"), "utf8")).toBe("new value\n");
    expect(lstatSync(join(root, "src/example.ts")).mode & 0o111).not.toBe(0);
    expect(readFileSync(join(root, "src/new.ts"), "utf8")).toBe("created\n");
    expect(existsSync(join(root, "src/old.ts"))).toBe(false);
  });

  it("applies separated hunks and exact final-newline state", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "one\ntwo\nthree");
    const patch = Buffer.from(
      "diff --git a/src/example.ts b/src/example.ts\n" +
        "--- a/src/example.ts\n" +
        "+++ b/src/example.ts\n" +
        "@@ -1,1 +1,1 @@\n-one\n+ONE\n" +
        "@@ -3,1 +3,1 @@\n-three\n\\ No newline at end of file\n+THREE\n\\ No newline at end of file\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(readFileSync(join(root, "src/example.ts"), "utf8")).toBe("ONE\ntwo\nTHREE");
  });

  it("rejects invalid operation state", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    expect(() => applyPatchSet(root, parseUnifiedPatch(modificationPatch()))).toThrow(
      /missing source/,
    );
    writeFileSync(join(root, "src/new.ts"), "exists\n");
    expect(() => applyPatchSet(root, parseUnifiedPatch(creationPatch()))).toThrow(
      /already exists/,
    );
    expect(() => applyPatchSet(root, parseUnifiedPatch(deletionPatch()))).toThrow(
      /missing source/,
    );
  });

  it("rejects context, newline, hunk-range, and symlink-parent mismatches", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/example.ts"), "different\n");
    expect(() => applyPatchSet(root, parseUnifiedPatch(modificationPatch()))).toThrow(
      /context/,
    );

    writeFileSync(join(root, "src/example.ts"), "old value");
    expect(() => applyPatchSet(root, parseUnifiedPatch(modificationPatch()))).toThrow(
      /newline/,
    );

    writeFileSync(join(root, "src/example.ts"), "old value\n");
    expect(() =>
      applyPatchSet(
        root,
        parseUnifiedPatch(modificationPatch({ oldStart: 3, newStart: 1 })),
      ),
    ).toThrow(/old range/);
    expect(() =>
      applyPatchSet(
        root,
        parseUnifiedPatch(modificationPatch({ oldStart: 1, newStart: 2 })),
      ),
    ).toThrow(/new range/);

    const outside = temporaryRoot();
    symlinkSync(outside, join(root, "linked"), "dir");
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(creationPatch("linked/new.ts"))),
    ).toThrow(/symlink/);
  });
});

describe("source materialization", () => {
  it("copies regular files, preserves mode, and omits .git", () => {
    const source = temporaryRoot();
    const destination = temporaryRoot();
    mkdirSync(join(source, "src"));
    mkdirSync(join(source, ".git"));
    writeFileSync(join(source, "src/script.js"), "console.log('safe');\n");
    chmodSync(join(source, "src/script.js"), 0o755);
    expect(copySourceTree(source, destination)).toEqual({ members: 2, totalBytes: 21 });
    expect(existsSync(join(destination, ".git"))).toBe(false);
    expect(lstatSync(join(destination, "src/script.js")).mode & 0o111).not.toBe(0);
  });

  it("rejects node_modules, symlinks, member, file, and aggregate limits", () => {
    const source = temporaryRoot();
    const destination = temporaryRoot();
    mkdirSync(join(source, "node_modules"));
    expect(() => copySourceTree(source, destination)).toThrow(/node_modules/);
    rmSync(join(source, "node_modules"), { recursive: true });

    writeFileSync(join(source, "file.txt"), "1234");
    symlinkSync(join(source, "file.txt"), join(source, "link.txt"));
    expect(() => copySourceTree(source, destination)).toThrow(/symlink/);
    rmSync(join(source, "link.txt"));

    expect(() =>
      copySourceTree(source, destination, {
        maximumMembers: 0,
        maximumFileBytes: 10,
        maximumTotalBytes: 10,
      }),
    ).toThrow(/member limit/);
    expect(() =>
      copySourceTree(source, destination, {
        maximumMembers: 10,
        maximumFileBytes: 3,
        maximumTotalBytes: 10,
      }),
    ).toThrow(/file exceeds/);
    expect(() =>
      copySourceTree(source, destination, {
        maximumMembers: 10,
        maximumFileBytes: 10,
        maximumTotalBytes: 3,
      }),
    ).toThrow(/aggregate/);
  });
});

describe("fixed command execution", () => {
  it("runs Node without a shell and returns bounded success", () => {
    const spawnSyncImpl = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: "ok",
      stderr: "",
      error: undefined,
    }));
    expect(
      runFixedCommand({
        modulePath: "/opt/noema/tool.mjs",
        args: ["run"],
        cwd: "/workspace/source",
        timeoutMs: 1000,
        maximumOutputBytes: 32,
        spawnSyncImpl,
      }),
    ).toEqual({
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
      maxBuffer: 32,
    });
  });

  it.each([
    [{ status: 2, signal: null, stdout: "", stderr: "failed" }, 2, "command_failed"],
    [
      {
        status: null,
        signal: "SIGKILL",
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }),
      },
      124,
      "command_timeout",
    ],
    [
      {
        status: null,
        signal: null,
        stdout: "x".repeat(5000),
        stderr: "",
        error: Object.assign(new Error("overflow"), { code: "ENOBUFS" }),
      },
      125,
      "command_output_limit",
    ],
    [
      {
        status: null,
        signal: null,
        stdout: "",
        stderr: "",
        error: Object.assign(new Error("launch"), { code: "ENOENT" }),
      },
      126,
      "command_launch_failed",
    ],
    [{ status: null, signal: "SIGTERM", stdout: "", stderr: "" }, 128, "command_failed"],
  ])("classifies failure", (completed, exitCode, reasonCode) => {
    const result = runFixedCommand({
      modulePath: "/opt/noema/tool.mjs",
      args: [],
      cwd: "/workspace/source",
      spawnSyncImpl: () => completed,
    });
    expect(result.exitCode).toBe(exitCode);
    expect(result.reasonCodes).toEqual([reasonCode]);
    expect(result.stdoutExcerpt.length).toBeLessThanOrEqual(4000);
  });

  it("runs Vitest only after TypeScript succeeds", () => {
    const calls = [];
    const result = runValidationCommands("/workspace/source", {
      spawnSyncImpl: (...args) => {
        calls.push(args);
        return { status: 0, signal: null, stdout: "ok", stderr: "" };
      },
      typescriptModule: "/opt/noema/tsc",
      vitestModule: "/opt/noema/vitest",
    });
    expect(result.exitCode).toBe(0);
    expect(calls.map((call) => call[1][0])).toEqual([
      "/opt/noema/tsc",
      "/opt/noema/vitest",
    ]);

    calls.length = 0;
    expect(
      runValidationCommands("/workspace/source", {
        spawnSyncImpl: (...args) => {
          calls.push(args);
          return { status: 1, signal: null, stdout: "", stderr: "type error" };
        },
        typescriptModule: "/opt/noema/tsc",
        vitestModule: "/opt/noema/vitest",
      }).exitCode,
    ).toBe(1);
    expect(calls).toHaveLength(1);
  });
});

describe("bounded result channel", () => {
  it("writes JSON to a pre-created stable regular file", () => {
    const root = temporaryRoot();
    const resultPath = join(root, "result.json");
    writeFileSync(resultPath, "");
    writeResultFile(resultPath, { status: "passed", value: "safe" });
    expect(JSON.parse(readFileSync(resultPath, "utf8"))).toEqual({
      status: "passed",
      value: "safe",
    });
  });

  it("rejects missing, symlinked, and oversized channels", () => {
    const root = temporaryRoot();
    expect(() => writeResultFile(join(root, "missing.json"), { status: "passed" })).toThrow(
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
  it("materializes, patches, validates, and emits exact passed evidence", () => {
    const fixture = runtimeFixture();
    const times = [1000, 1010];
    const result = runCli({
      env: environment(fixture.patchBytes),
      ...fixture,
      now: () => times.shift(),
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
    expect(readFileSync(join(fixture.workspaceRoot, "source/src/example.ts"), "utf8")).toBe(
      "new value\n",
    );
    expect(lstatSync(join(fixture.workspaceRoot, "source/node_modules")).isSymbolicLink()).toBe(
      true,
    );
  });

  it("emits failed evidence for fixed validation failure", () => {
    const fixture = runtimeFixture();
    const result = runCli({
      env: environment(fixture.patchBytes),
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

  it.each([
    [Buffer.from("not a patch"), {}, /patch/],
    [modificationPatch(), { NOEMA_PATCH_SHA256: "0".repeat(64) }, /digest/],
  ])("emits blocked evidence for hostile input", (patchBytes, overrides, message) => {
    const fixture = runtimeFixture(patchBytes);
    const result = runCli({
      env: environment(patchBytes, overrides),
      ...fixture,
      spawnSyncImpl: vi.fn(),
    });
    expect(result.status).toBe("blocked");
    expect(result.reason_codes).toEqual(["patch_blocked"]);
    expect(result.stderr_excerpt).toMatch(message);
  });

  it("rejects invalid environment before touching result", () => {
    const fixture = runtimeFixture();
    expect(() =>
      runCli({
        env: environment(fixture.patchBytes, { NOEMA_PATCH_PROFILE: "arbitrary" }),
        ...fixture,
      }),
    ).toThrow(/environment/);
    expect(readFileSync(fixture.resultPath, "utf8")).toBe("");
  });
});
