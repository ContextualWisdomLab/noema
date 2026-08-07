import { describe, expect, it, vi } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

const OID = "a".repeat(40);
const OTHER_OID = "b".repeat(40);

function result(stdout = "", status = 0) {
  return { status, signal: null, error: undefined, stdout, stderr: "" };
}

function spawnSequence(...values: Array<ReturnType<typeof result>>) {
  const spawn = vi.fn();
  values.forEach((value) => spawn.mockReturnValueOnce(value));
  return spawn;
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    dev: 1,
    ino: 2,
    mode: 0o100644,
    size: 8,
    mtimeMs: 10,
    ctimeMs: 11,
    isFile: () => true,
    isSymbolicLink: () => false,
    ...overrides,
  };
}

function fileSystem(states: Array<Record<string, unknown>>, target = Buffer.from("target")) {
  const lstatSync = vi.fn();
  states.forEach((value) => lstatSync.mockReturnValueOnce(value));
  return { lstatSync, readlinkSync: vi.fn(() => target) };
}

function listing(mode = "100644", path = "tracked.txt") {
  return `${mode} ${OID} 0\t${path}\0`;
}

describe("acquisition tracked-object hashing", () => {
  it("authenticates a regular file with Git filters disabled", () => {
    const metadata = state();
    const spawn = spawnSequence(result(listing()), result(OID));
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem: fileSystem([metadata, metadata]) as never,
    })).toBe(1);
    expect(spawn).toHaveBeenLastCalledWith(
      "git",
      ["hash-object", "--no-filters", "--", "tracked.txt"],
      expect.objectContaining({ cwd: "/repo" }),
    );
  });

  it.each([
    state({ isFile: undefined }),
    state({ isSymbolicLink: undefined }),
    state({ isFile: () => false }),
    state({ isSymbolicLink: () => true }),
  ])("rejects the wrong regular-file object type", (metadata) => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing())),
      fileSystem: fileSystem([metadata]) as never,
    })).toThrow("object type differs");
  });

  it("authenticates symbolic-link target bytes through stdin", () => {
    const metadata = state({
      mode: 0o120777,
      size: 6,
      isFile: () => false,
      isSymbolicLink: () => true,
    });
    const target = Buffer.from("target");
    const fs = fileSystem([metadata, metadata], target);
    const spawn = spawnSequence(result(listing("120000", "linked")), result(OID));
    expect(verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawn,
      fileSystem: fs as never,
    })).toBe(1);
    expect(fs.readlinkSync).toHaveBeenCalledWith("/repo/linked", { encoding: "buffer" });
    expect(spawn).toHaveBeenLastCalledWith(
      "git",
      ["hash-object", "--stdin"],
      expect.objectContaining({ input: target }),
    );
  });

  it("rejects a symbolic-link entry backed by a regular file", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing("120000", "linked"))),
      fileSystem: fileSystem([state()]) as never,
    })).toThrow("object type differs");
  });

  it.each([
    state({ size: -1 }),
    state({ size: Number.NaN }),
    state({ size: 32 * 1024 * 1024 + 1 }),
  ])("rejects invalid or oversized file byte counts", (metadata) => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing()), result(OID)),
      fileSystem: fileSystem([metadata]) as never,
    })).toThrow("file-byte limit");
  });

  it("rejects failed, malformed, and mismatched hash evidence", () => {
    const metadata = state();
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing()), result("", 2)),
      fileSystem: fileSystem([metadata]) as never,
    })).toThrow("hashing failed");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing()), result("invalid")),
      fileSystem: fileSystem([metadata]) as never,
    })).toThrow("malformed output");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing()), result(OTHER_OID)),
      fileSystem: fileSystem([metadata, metadata]) as never,
    })).toThrow("authenticated Git index bytes");
  });

  it("rejects metadata movement during hashing", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(result(listing()), result(OID)),
      fileSystem: fileSystem([state(), state({ ino: 3 })]) as never,
    })).toThrow("changed during raw-byte authentication");
  });
});
