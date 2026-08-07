import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

const SHA1_A = "a".repeat(40);
const SHA1_B = "b".repeat(40);
const SHA256_A = "a".repeat(64);

function runGit(root: string, args: string[]) {
  const result = spawnSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.signal) {
    throw new Error(`Git fixture command terminated by ${result.signal}`);
  }
  if (result.status !== 0) {
    throw new Error(`Git fixture command failed: git ${args.join(" ")}\n${result.stderr}`);
  }
  return result;
}

function gitResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 0,
    signal: null,
    error: undefined,
    stdout: "",
    stderr: "",
    ...overrides,
  };
}

function spawnSequence(...results: Array<Record<string, unknown>>) {
  const mock = vi.fn();
  results.forEach((result) => mock.mockReturnValueOnce(gitResult(result)));
  return mock;
}

function regularMetadata(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100644,
    size: 8,
    mtimeMs: 3,
    ctimeMs: 4,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function symbolicLinkMetadata(overrides: Record<string, unknown> = {}) {
  return regularMetadata({
    mode: 0o120777,
    size: 6,
    isFile: () => false,
    isSymbolicLink: () => true,
    ...overrides,
  });
}

function trackedRecord(
  path = "tracked.txt",
  objectId = SHA1_A,
  mode = "100644",
  stage = "0",
) {
  return `${mode} ${objectId} ${stage}\t${path}\0`;
}

describe("acquisition exact tracked-byte authentication", () => {
  it.skipIf(process.platform === "win32")(
    "rejects same-size content drift even when Git's stat cache reports a clean worktree",
    () => {
      const root = mkdtempSync(join(tmpdir(), "noema-acquisition-content-hash-"));
      const trackedPath = join(root, "tracked.txt");
      const oldTimestamp = new Date("2020-01-01T00:00:00.000Z");
      try {
        runGit(root, ["init", "--quiet"]);
        runGit(root, ["config", "core.trustctime", "false"]);
        runGit(root, ["config", "core.checkStat", "minimal"]);
        writeFileSync(trackedPath, "tracked\n", "utf8");
        utimesSync(trackedPath, oldTimestamp, oldTimestamp);
        runGit(root, ["add", "tracked.txt"]);
        runGit(root, [
          "-c",
          "user.name=Noema Tests",
          "-c",
          "user.email=noema-tests@example.invalid",
          "commit",
          "--quiet",
          "-m",
          "fixture",
        ]);

        const committedMetadata = statSync(trackedPath);
        writeFileSync(trackedPath, "tamperd\n", "utf8");
        utimesSync(trackedPath, committedMetadata.atime, committedMetadata.mtime);

        const cachedComparison = spawnSync(
          "git",
          ["diff-files", "--quiet", "--no-ext-diff", "--no-textconv", "--ignore-submodules=none", "--"],
          { cwd: root, encoding: "utf8", timeout: 10_000 },
        );
        expect(cachedComparison.error).toBeUndefined();
        expect(cachedComparison.signal).toBeNull();
        expect(cachedComparison.status).toBe(0);

        expect(() => verifyAcquisitionTrackedBytes({ cwd: root }))
          .toThrow("tracked checkout differs from its authenticated Git index bytes");
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );

  it("accepts an empty tracked index including the null-output defensive fallback", () => {
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: "" }),
    })).toBe(0);
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: null }),
    })).toBe(0);
  });

  it("fails closed when tracked-index inspection fails or is malformed", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ status: 2 }),
    })).toThrow("acquisition tracked-byte index inspection failed");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord().slice(0, -1) }),
    })).toThrow("acquisition tracked-byte index returned malformed output");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: "not-an-index-record\0" }),
    })).toThrow("acquisition tracked-byte index returned malformed output");
  });

  it("bounds tracked entry count and path bytes", () => {
    const excessiveEntries = trackedRecord().repeat(20_001);
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: excessiveEntries }),
    })).toThrow("acquisition tracked-byte index exceeds the entry limit");

    const longPath = "a".repeat(4097);
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord(longPath) }),
    })).toThrow("acquisition tracked-byte index exceeds the path limit");

    const nearLimitPath = `dir/${"a".repeat(4080)}`;
    const cumulativePathOutput = Array.from(
      { length: 520 },
      (_, index) => trackedRecord(`${nearLimitPath}${String(index).padStart(4, "0")}`),
    ).join("");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: cumulativePathOutput }),
    })).toThrow("acquisition tracked-byte index exceeds the path limit");
  });

  it("rejects unmerged, unsupported-mode, and escaping tracked entries", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord("tracked.txt", SHA1_A, "100644", "1") }),
    })).toThrow("acquisition tracked-byte index contains an unmerged entry");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord("submodule", SHA1_A, "160000") }),
    })).toThrow("acquisition tracked-byte index contains an unsupported object mode");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord(".") }),
    })).toThrow("acquisition tracked-byte index contains an unsafe path");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord("../escape.txt") }),
    })).toThrow("acquisition tracked-byte index contains an unsafe path");
  });

  it("authenticates regular and symbolic-link bytes including SHA-256 object identities", () => {
    const regular = regularMetadata();
    const link = symbolicLinkMetadata();
    const fileSystem = {
      lstatSync: vi.fn((path: string) => path.endsWith("link.txt") ? link : regular),
      readlinkSync: vi.fn(() => Buffer.from("target")),
    };
    const spawn = spawnSequence(
      { stdout: `${trackedRecord("tracked.txt", SHA256_A)}${trackedRecord("link.txt", SHA1_B, "120000")}` },
      { stdout: `${SHA256_A}\n` },
      { stdout: `${SHA1_B}\n` },
    );
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem,
    })).toBe(2);
    expect(fileSystem.readlinkSync).toHaveBeenCalledWith("/repo/link.txt", { encoding: "buffer" });
    expect(spawn).toHaveBeenLastCalledWith(
      "git",
      ["hash-object", "--stdin"],
      expect.objectContaining({ input: Buffer.from("target"), maxBuffer: 4096 }),
    );
  });

  it("supports a filesystem-root worktree while keeping paths inside that root", () => {
    const metadata = regularMetadata();
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord("tmp/tracked.txt") },
        { stdout: `${SHA1_A}\n` },
      ),
      fileSystem: {
        lstatSync: vi.fn(() => metadata),
        readlinkSync: vi.fn(),
      },
    })).toBe(1);
  });

  it.each([
    [{ isSymbolicLink: undefined }, "tracked checkout object type differs from its authenticated Git index"],
    [{ isSymbolicLink: () => false }, "tracked checkout object type differs from its authenticated Git index"],
  ])("rejects invalid symbolic-link filesystem metadata %#", (overrides, message) => {
    const metadata = symbolicLinkMetadata(overrides);
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord("link.txt", SHA1_A, "120000") }),
      fileSystem: {
        lstatSync: vi.fn(() => metadata),
        readlinkSync: vi.fn(() => Buffer.from("target")),
      },
    })).toThrow(message);
  });

  it.each([
    [{ isFile: undefined }, "missing isFile"],
    [{ isSymbolicLink: undefined }, "missing isSymbolicLink"],
    [{ isFile: () => false }, "non-file"],
    [{ isSymbolicLink: () => true }, "unexpected symlink"],
  ])("rejects invalid regular-file filesystem metadata: %s", (overrides) => {
    const metadata = regularMetadata(overrides);
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: trackedRecord() }),
      fileSystem: {
        lstatSync: vi.fn(() => metadata),
        readlinkSync: vi.fn(),
      },
    })).toThrow("tracked checkout object type differs from its authenticated Git index");
  });

  it.each([
    [12.5, "non-integer"],
    [-1, "negative"],
    [32 * 1024 * 1024 + 1, "over per-file limit"],
  ])("rejects invalid tracked byte size: %s (%s)", (size) => {
    const metadata = regularMetadata({ size });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { stdout: `${SHA1_A}\n` },
      ),
      fileSystem: {
        lstatSync: vi.fn(() => metadata),
        readlinkSync: vi.fn(),
      },
    })).toThrow("tracked checkout exceeds the acquisition file-byte limit");
  });

  it("rejects hash command failure and malformed object output", () => {
    const metadata = regularMetadata();
    const fileSystem = {
      lstatSync: vi.fn(() => metadata),
      readlinkSync: vi.fn(),
    };
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { status: 2 },
      ),
      fileSystem,
    })).toThrow("acquisition tracked-byte hashing failed");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { stdout: null },
      ),
      fileSystem,
    })).toThrow("acquisition tracked-byte hashing returned malformed output");
  });

  it.each([
    ["dev", 9],
    ["ino", 9],
    ["mode", 9],
    ["size", 9],
    ["mtimeMs", 9],
    ["ctimeMs", 9],
  ])("rejects tracked metadata drift in %s", (field, changedValue) => {
    const before = regularMetadata();
    const after = regularMetadata({ [field]: changedValue });
    const fileSystem = {
      lstatSync: vi.fn()
        .mockReturnValueOnce(before)
        .mockReturnValueOnce(after),
      readlinkSync: vi.fn(),
    };
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { stdout: `${SHA1_A}\n` },
      ),
      fileSystem,
    })).toThrow("tracked checkout changed during raw-byte authentication");
  });

  it("rejects absent post-hash metadata and an object-id mismatch", () => {
    const before = regularMetadata();
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { stdout: `${SHA1_A}\n` },
      ),
      fileSystem: {
        lstatSync: vi.fn().mockReturnValueOnce(before).mockReturnValueOnce(null),
        readlinkSync: vi.fn(),
      },
    })).toThrow("tracked checkout changed during raw-byte authentication");

    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        { stdout: trackedRecord() },
        { stdout: `${SHA1_B}\n` },
      ),
      fileSystem: {
        lstatSync: vi.fn(() => before),
        readlinkSync: vi.fn(),
      },
    })).toThrow("tracked checkout differs from its authenticated Git index bytes");
  });

  it("enforces the aggregate tracked-byte budget after independently bounded files", () => {
    const paths = Array.from({ length: 9 }, (_, index) => `file-${index}.bin`);
    const listing = paths.map((path) => trackedRecord(path)).join("");
    const spawn = spawnSequence(
      { stdout: listing },
      ...paths.map(() => ({ stdout: `${SHA1_A}\n` })),
    );
    const metadata = regularMetadata({ size: 32 * 1024 * 1024 });
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem: {
        lstatSync: vi.fn(() => metadata),
        readlinkSync: vi.fn(),
      },
    })).toThrow("tracked checkout exceeds the acquisition aggregate-byte limit");
  });
});
