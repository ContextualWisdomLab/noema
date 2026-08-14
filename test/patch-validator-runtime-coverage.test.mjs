import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  MAX_CHANGED_FILES,
  MAX_PATCH_BYTES,
  MAX_RESULT_DURATION_MS,
  MAX_SOURCE_FILE_BYTES,
  applyPatchSet,
  copySourceTree,
  parseUnifiedPatch,
  runCli,
  runFixedCommand,
  validateRepositoryPath,
} from "../patch-validator/runtime.mjs";

const roots = [];

function temporaryRoot() {
  const root = mkdtempSync(join(tmpdir(), "noema-patch-coverage-"));
  roots.push(root);
  return root;
}

function modificationPatch({
  path = "src/example.ts",
  oldText = "old value",
  newText = "new value",
  oldStart = 1,
  newStart = 1,
  oldCount = 1,
  newCount = 1,
  trailingNewline = true,
} = {}) {
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      `--- a/${path}\n` +
      `+++ b/${path}\n` +
      `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@\n` +
      `-${oldText}\n` +
      `+${newText}${trailingNewline ? "\n" : ""}`,
  );
}

function creationPatch(path, text = "created") {
  return Buffer.from(
    `diff --git a/${path} b/${path}\n` +
      "new file mode 100644\n" +
      "--- /dev/null\n" +
      `+++ b/${path}\n` +
      "@@ -0,0 +1,1 @@\n" +
      `+${text}\n`,
  );
}

function deletionPatch(path, text = "obsolete") {
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

function runtimeFixture(patchBytes = modificationPatch()) {
  const root = temporaryRoot();
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
    root,
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

describe("remaining strict parser boundaries", () => {
  it("rejects non-string paths and the alternate binary marker", () => {
    expect(() => validateRepositoryPath(42)).toThrow(/unsafe/);
    expect(() =>
      parseUnifiedPatch(Buffer.from("diff --git a/x b/x\nBinary files a/x and b/x differ")),
    ).toThrow(/binary/);
  });

  it("accepts a patch whose final hunk line has no transport newline", () => {
    const [parsed] = parseUnifiedPatch(modificationPatch({ trailingNewline: false }));
    expect(parsed.hunks[0].lines.at(-1)).toMatchObject({ kind: "add", text: "new value" });
  });

  it("rejects changed-file overflow before parsing a 101st body", () => {
    const patches = Array.from(
      { length: MAX_CHANGED_FILES + 1 },
      (_, index) => creationPatch(`src/generated-${index}.ts`),
    );
    expect(() => parseUnifiedPatch(Buffer.concat(patches))).toThrow(/too many files/);
  });

  it.each([
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\nunexpected metadata\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-x\n+y\n",
    ),
    Buffer.from(
      'diff --git a/src/x.ts b/src/x.ts\n--- "x/src/x.ts"\n+++ b/src/x.ts\n@@ -1 +1 @@\n-x\n+y\n',
    ),
    Buffer.from(
      "diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -0,0 +0,0 @@\n+extra\n",
    ),
  ])("rejects additional malformed grammar", (patch) => {
    expect(() => parseUnifiedPatch(patch)).toThrow(/patch/);
  });

  it("creates an empty file from a zero-count hunk", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    const patch = Buffer.from(
      "diff --git a/src/empty.ts b/src/empty.ts\n" +
        "new file mode 100644\n" +
        "--- /dev/null\n" +
        "+++ b/src/empty.ts\n" +
        "@@ -0,0 +0,0 @@\n",
    );
    applyPatchSet(root, parseUnifiedPatch(patch));
    expect(readFileSync(join(root, "src/empty.ts"), "utf8")).toBe("");
  });
});

describe("remaining patch application boundaries", () => {
  it("rejects a missing parent for modification and a non-directory creation parent", () => {
    const root = temporaryRoot();
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(modificationPatch({ path: "missing/x.ts" }))),
    ).toThrow(/missing parent/);

    writeFileSync(join(root, "parent"), "not a directory");
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(creationPatch("parent/x.ts"))),
    ).toThrow(/directory/);
  });

  it("rejects symlink, directory, and oversized source files", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "target.ts"), "old value\n");
    symlinkSync(join(root, "target.ts"), join(root, "src/link.ts"));
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(modificationPatch({ path: "src/link.ts" }))),
    ).toThrow(/regular non-symlink/);

    mkdirSync(join(root, "src/directory.ts"));
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(modificationPatch({ path: "src/directory.ts" }))),
    ).toThrow(/regular non-symlink/);

    const oversized = join(root, "src/oversized.ts");
    writeFileSync(oversized, "");
    truncateSync(oversized, MAX_SOURCE_FILE_BYTES + 1);
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(modificationPatch({ path: "src/oversized.ts" }))),
    ).toThrow(/byte limit/);
  });

  it("rejects deletion that leaves authenticated source content", () => {
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "src/old.ts"), "obsolete\nretained\n");
    expect(() =>
      applyPatchSet(root, parseUnifiedPatch(deletionPatch("src/old.ts"))),
    ).toThrow(/complete source/);
  });

  it("rejects a non-regular source-tree object", () => {
    const source = temporaryRoot();
    const destination = temporaryRoot();
    const fifo = join(source, "named-pipe");
    const completed = spawnSync("mkfifo", [fifo], { shell: false });
    expect(completed.status).toBe(0);
    expect(() => copySourceTree(source, destination)).toThrow(/non-regular/);
  });
});

describe("remaining subprocess and orchestration boundaries", () => {
  it("normalizes absent subprocess output", () => {
    expect(
      runFixedCommand({
        modulePath: "/opt/noema/tool.mjs",
        args: [],
        cwd: "/workspace/source",
        spawnSyncImpl: () => ({ status: 0, signal: null, error: undefined }),
      }),
    ).toEqual({
      exitCode: 0,
      stdoutExcerpt: "",
      stderrExcerpt: "",
      reasonCodes: [],
    });
  });

  it.each([
    ["missing", "unavailable", (fixture) => rmSync(fixture.patchPath)],
    ["empty", "invalid byte length", (fixture) => writeFileSync(fixture.patchPath, "")],
    [
      "directory",
      "regular non-symlink",
      (fixture) => {
        rmSync(fixture.patchPath);
        mkdirSync(fixture.patchPath);
      },
    ],
    [
      "symlink",
      "regular non-symlink",
      (fixture) => {
        const target = join(fixture.root, "patch-target");
        writeFileSync(target, fixture.patchBytes);
        rmSync(fixture.patchPath);
        symlinkSync(target, fixture.patchPath);
      },
    ],
    [
      "oversized",
      "invalid byte length",
      (fixture) => truncateSync(fixture.patchPath, MAX_PATCH_BYTES + 1),
    ],
  ])("emits blocked evidence for a %s patch file", (_name, message, mutate) => {
    const fixture = runtimeFixture();
    mutate(fixture);
    const result = runCli({
      env: environment(fixture.patchBytes),
      ...fixture,
      spawnSyncImpl: vi.fn(),
    });
    expect(result).toMatchObject({ status: "blocked", reason_codes: ["patch_blocked"] });
    expect(result.stderr_excerpt).toMatch(new RegExp(message));
  });

  it("rejects a pre-existing private node_modules path", () => {
    const fixture = runtimeFixture();
    mkdirSync(join(fixture.workspaceRoot, "source/node_modules"), { recursive: true });
    const result = runCli({
      env: environment(fixture.patchBytes),
      ...fixture,
      spawnSyncImpl: vi.fn(),
    });
    expect(result.status).toBe("blocked");
    expect(result.stderr_excerpt).toMatch(/unexpectedly contains node_modules/);
  });

  it.each(["file", "symlink", "missing"])(
    "rejects an invalid image node_modules %s",
    (kind) => {
      const fixture = runtimeFixture();
      if (kind === "file") {
        rmSync(fixture.nodeModulesPath, { recursive: true });
        writeFileSync(fixture.nodeModulesPath, "not a directory");
      } else if (kind === "symlink") {
        const target = temporaryRoot();
        rmSync(fixture.nodeModulesPath, { recursive: true });
        symlinkSync(target, fixture.nodeModulesPath, "dir");
      } else {
        rmSync(fixture.nodeModulesPath, { recursive: true });
      }
      const result = runCli({
        env: environment(fixture.patchBytes),
        ...fixture,
        spawnSyncImpl: vi.fn(),
      });
      expect(result.status).toBe("blocked");
      expect(result.stderr_excerpt).toMatch(/node_modules|no such file/i);
    },
  );

  it("clamps negative and excessive durations", () => {
    const negative = runtimeFixture();
    const negativeTimes = [100, 50];
    expect(
      runCli({
        env: environment(negative.patchBytes),
        ...negative,
        now: () => negativeTimes.shift(),
        spawnSyncImpl: successfulCommand,
      }).duration_ms,
    ).toBe(0);

    const excessive = runtimeFixture();
    const excessiveTimes = [0, MAX_RESULT_DURATION_MS + 1];
    expect(
      runCli({
        env: environment(excessive.patchBytes),
        ...excessive,
        now: () => excessiveTimes.shift(),
        spawnSyncImpl: successfulCommand,
      }).duration_ms,
    ).toBe(MAX_RESULT_DURATION_MS);
  });
});

describe("descriptor-race and atomic-write defenses", () => {
  it("rejects a result inode change after opening", async () => {
    const actual = await vi.importActual("node:fs");
    vi.doMock("node:fs", () => ({
      ...actual,
      fstatSync(descriptor) {
        const metadata = actual.fstatSync(descriptor);
        return { ...metadata, ino: metadata.ino + 1 };
      },
    }));
    const { writeResultFile } = await import("../patch-validator/validate-patch.mjs");
    const root = temporaryRoot();
    const resultPath = join(root, "result.json");
    writeFileSync(resultPath, "");
    expect(() => writeResultFile(resultPath, { status: "passed" })).toThrow(/changed/);
  });

  it("cleans an opened temporary file when its descriptor write fails", async () => {
    const actual = await vi.importActual("node:fs");
    vi.doMock("node:fs", () => ({
      ...actual,
      writeFileSync(target, ...args) {
        if (typeof target === "number") {
          throw new Error("forced descriptor failure");
        }
        return actual.writeFileSync(target, ...args);
      },
    }));
    const { applyPatchSet: applyWithFault } = await import(
      "../patch-validator/validate-patch.mjs"
    );
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    expect(() =>
      applyWithFault(root, [
        {
          path: "src/new.ts",
          operation: "create",
          mode: "100644",
          hunks: [
            {
              oldStart: 0,
              oldCount: 0,
              newStart: 1,
              newCount: 1,
              lines: [
                {
                  kind: "add",
                  text: "new",
                  oldNoNewline: false,
                  newNoNewline: false,
                },
              ],
            },
          ],
        },
      ]),
    ).toThrow(/forced descriptor failure/);
    expect(existsSync(join(root, "src/new.ts"))).toBe(false);
  });

  it("handles a temporary-file open failure before a descriptor exists", async () => {
    const actual = await vi.importActual("node:fs");
    vi.doMock("node:fs", () => ({
      ...actual,
      openSync() {
        throw new Error("forced open failure");
      },
    }));
    const { applyPatchSet: applyWithFault } = await import(
      "../patch-validator/validate-patch.mjs"
    );
    const root = temporaryRoot();
    mkdirSync(join(root, "src"));
    expect(() =>
      applyWithFault(root, [
        {
          path: "src/new.ts",
          operation: "create",
          mode: "100644",
          hunks: [
            {
              oldStart: 0,
              oldCount: 0,
              newStart: 1,
              newCount: 1,
              lines: [
                {
                  kind: "add",
                  text: "new",
                  oldNoNewline: false,
                  newNoNewline: false,
                },
              ],
            },
          ],
        },
      ]),
    ).toThrow(/forced open failure/);
  });
});
