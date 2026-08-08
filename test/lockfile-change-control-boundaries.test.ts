import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  evaluateLockfileChange,
  readBoundedUtf8,
  runLockfileChangeControl,
} from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);
const temporaryRoots: string[] = [];

function temporaryRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "noema-lock-control-"));
  temporaryRoots.push(root);
  return root;
}

function lock(packages: Record<string, unknown>, version = "0.1.0") {
  return {
    name: "noema",
    version,
    lockfileVersion: 3,
    requires: true,
    packages,
  };
}

function policy(targetPackages: unknown, overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    baseSha: BASE_SHA,
    targetPackages,
    justification: "Reviewed dependency change with bounded provenance evidence.",
    sources: ["https://github.com/advisories/GHSA-2v37-7h3g-55p8"],
    ...overrides,
  };
}

function changedLocks() {
  return {
    baseLock: lock({ "node_modules/nanoid": { version: "3.3.16" } }),
    headLock: lock({ "node_modules/nanoid": { version: "3.3.17" } }),
  };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe("lockfile change-control boundary coverage", () => {
  it("reads bounded regular UTF-8 files across more than one internal chunk", () => {
    const root = temporaryRoot();
    const path = join(root, "large.txt");
    const value = `${"a".repeat(70 * 1024)}끝`;
    writeFileSync(path, value, "utf8");

    expect(readBoundedUtf8(path, Buffer.byteLength(value))).toBe(value);
  });

  it("rejects invalid bounded-read arguments before opening a path", () => {
    for (const [path, maximumBytes] of [
      ["", 1],
      [null, 1],
      ["missing", 0],
      ["missing", -1],
      ["missing", 1.5],
      ["missing", Number.MAX_SAFE_INTEGER + 1],
    ] as const) {
      expect(() => readBoundedUtf8(path as never, maximumBytes)).toThrow(
        "bounded UTF-8 read requires a path and positive safe byte ceiling",
      );
    }
  });

  it("rejects directories, oversized files, symlinks, and invalid UTF-8", () => {
    const root = temporaryRoot();
    const directory = join(root, "directory");
    mkdirSync(directory);
    expect(() => readBoundedUtf8(directory, 1024)).toThrow();

    const oversized = join(root, "oversized.json");
    writeFileSync(oversized, "1234", "utf8");
    expect(() => readBoundedUtf8(oversized, 3)).toThrow(
      "bounded UTF-8 input is not a safe regular file within the byte ceiling",
    );

    const target = join(root, "target.txt");
    const link = join(root, "link.txt");
    writeFileSync(target, "safe", "utf8");
    symlinkSync(target, link);
    expect(() => readBoundedUtf8(link, 1024)).toThrow();

    const invalidUtf8 = join(root, "invalid.bin");
    writeFileSync(invalidUtf8, Buffer.from([0xff]));
    expect(() => readBoundedUtf8(invalidUtf8, 1)).toThrow();
  });

  it("rejects malformed package paths and every bounded policy evidence class", () => {
    const { baseLock, headLock } = changedLocks();
    const invalidPolicies = [
      policy("node_modules/nanoid"),
      policy([]),
      policy(Array.from({ length: 129 }, (_, index) => `node_modules/pkg-${index}`)),
      policy(["node_modules/nanoid", "node_modules/nanoid"]),
      policy([null]),
      policy(["nanoid"]),
      policy(["node_modules\\nanoid"]),
      policy(["node_modules//nanoid"]),
      policy(["node_modules/../nanoid"]),
      policy(["node_modules/./nanoid"]),
      policy(["node_modules/nanoid"], { justification: null }),
      policy(["node_modules/nanoid"], { justification: "   " }),
      policy(["node_modules/nanoid"], { justification: "x".repeat(4_001) }),
      policy(["node_modules/nanoid"], { sources: null }),
      policy(["node_modules/nanoid"], { sources: Array.from({ length: 17 }, () => "https://example.test/source") }),
      policy(["node_modules/nanoid"], { sources: [null] }),
      policy(["node_modules/nanoid"], { sources: [""] }),
      policy(["node_modules/nanoid"], { sources: [`https://example.test/${"x".repeat(2_048)}`] }),
      policy(["node_modules/nanoid"], { sources: ["not a URL"] }),
      policy(["node_modules/nanoid"], { sources: ["http://example.test/source"] }),
    ];

    for (const candidate of invalidPolicies) {
      expect(
        evaluateLockfileChange({ baseLock, headLock, policy: candidate, expectedBaseSha: BASE_SHA }).passed,
      ).toBe(false);
    }
  });

  it("rejects every malformed base binding and policy shape", () => {
    const { baseLock, headLock } = changedLocks();
    for (const [candidatePolicy, expectedBaseSha] of [
      [[], BASE_SHA],
      [policy(["node_modules/nanoid"], { schemaVersion: 2 }), BASE_SHA],
      [policy(["node_modules/nanoid"]), null],
      [policy(["node_modules/nanoid"]), "not-a-sha"],
      [policy(["node_modules/nanoid"], { baseSha: "2".repeat(40) }), BASE_SHA],
    ] as const) {
      expect(
        evaluateLockfileChange({
          baseLock,
          headLock,
          policy: candidatePolicy,
          expectedBaseSha: expectedBaseSha as never,
        }).passed,
      ).toBe(false);
    }
  });

  it("rejects target lists that do not exactly cover changed package nodes", () => {
    const baseLock = lock({
      "": { name: "noema" },
      "node_modules/a": { version: "1.0.0" },
      "node_modules/b": { version: "1.0.0" },
    });
    const headLock = lock({
      "": { name: "noema" },
      "node_modules/a": { version: "2.0.0" },
      "node_modules/b": { version: "2.0.0" },
    });

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policy(["node_modules/a"]),
        expectedBaseSha: BASE_SHA,
      }).passed,
    ).toBe(false);
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policy(["node_modules/a", "node_modules/c"]),
        expectedBaseSha: BASE_SHA,
      }).passed,
    ).toBe(false);
  });

  it("returns the top-level metadata failure even when package nodes are unchanged", () => {
    const baseLock = lock({ "": { name: "noema" } });
    const headLock = lock({ "": { name: "noema" } }, "0.2.0");
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: undefined,
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({
      passed: false,
      changedPackages: [],
      failures: ["package-lock top-level metadata changed outside the packages map"],
    });
  });

  it("distinguishes a missing policy from malformed or unreadable CI inputs", () => {
    const files = new Map<string, string>([
      ["/base-lock.json", JSON.stringify(changedLocks().baseLock)],
      ["package-lock.json", JSON.stringify(changedLocks().headLock)],
    ]);
    const missingPolicy = runLockfileChangeControl({
      environment: {
        NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
        NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
      },
      readText: (path) => {
        const value = files.get(path);
        if (value !== undefined) {
          return value;
        }
        throw Object.assign(new Error("missing"), { code: "ENOENT" });
      },
    });
    expect(missingPolicy.failures).toContain(
      "changed package-lock.json requires a reviewed lockfile change policy",
    );

    const unreadablePolicy = runLockfileChangeControl({
      environment: {
        NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
        NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
      },
      readText: (path) => {
        const value = files.get(path);
        if (value !== undefined) {
          return value;
        }
        throw Object.assign(new Error("denied"), { code: "EACCES" });
      },
    });
    expect(unreadablePolicy).toEqual({
      passed: false,
      changedPackages: [],
      failures: ["lockfile change-control inputs must be bounded valid UTF-8 JSON"],
    });

    const invalidJson = runLockfileChangeControl({
      environment: {
        NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
        NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
      },
      readText: () => "{",
    });
    expect(invalidJson).toEqual({
      passed: false,
      changedPackages: [],
      failures: ["lockfile change-control inputs must be bounded valid UTF-8 JSON"],
    });
  });

  it("rejects partial or malformed CI base context without reading files", () => {
    for (const environment of [
      { NOEMA_LOCKFILE_BASE_PATH: 1, NOEMA_LOCKFILE_BASE_SHA: BASE_SHA },
      { NOEMA_LOCKFILE_BASE_PATH: "", NOEMA_LOCKFILE_BASE_SHA: BASE_SHA },
      { NOEMA_LOCKFILE_BASE_PATH: "/base", NOEMA_LOCKFILE_BASE_SHA: 1 },
      { NOEMA_LOCKFILE_BASE_PATH: "/base", NOEMA_LOCKFILE_BASE_SHA: "bad" },
    ]) {
      let read = false;
      const result = runLockfileChangeControl({
        environment: environment as never,
        readText: () => {
          read = true;
          throw new Error("must not read");
        },
      });
      expect(read).toBe(false);
      expect(result.passed).toBe(false);
    }
  });
});
