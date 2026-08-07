import { describe, expect, it, vi } from "vitest";
import { verifyAcquisitionTrackedBytes } from "../scripts/lib/acquisition-git-preflight.mjs";

const OID = "a".repeat(40);

function result(stdout = "", status = 0) {
  return { status, signal: null, error: undefined, stdout, stderr: "" };
}

function spawnWith(stdout: string, status = 0) {
  return vi.fn(() => result(stdout, status));
}

function entry(mode: string, stage: string, path: string) {
  return `${mode} ${OID} ${stage}\t${path}\0`;
}

describe("acquisition tracked-byte index parsing", () => {
  it("accepts an empty bounded index", () => {
    const spawn = spawnWith("");
    expect(verifyAcquisitionTrackedBytes({ cwd: "/repo", spawnSyncImpl: spawn })).toBe(0);
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["ls-files", "--stage", "-z", "--cached", "--"],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024, timeout: 10_000 }),
    );
  });

  it("rejects a failed index command", () => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnWith("", 2),
    })).toThrow("tracked-byte source inspection failed");
  });

  it.each([
    [entry("100644", "0", "file").slice(0, -1), "malformed output"],
    ["not-an-entry\0", "malformed output"],
    [`100644 ${OID} 0\t\0`, "malformed output"],
    [`10064 ${OID} 0\tfile\0`, "malformed output"],
    [entry("100644", "1", "file"), "unmerged entry"],
    [entry("160000", "0", "module"), "unsupported object mode"],
    [entry("100644", "0", "../outside"), "unsafe path"],
    [entry("100644", "0", "."), "unsafe path"],
    [entry("100644", "0", "x".repeat(4097)), "path limit"],
  ])("fails closed on invalid index evidence", (stdout, message) => {
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnWith(stdout),
    })).toThrow(message);
  });

  it("rejects more than 20,000 tracked entries", () => {
    const stdout = Array.from(
      { length: 20_001 },
      (_, index) => entry("100644", "0", `f${index}`),
    ).join("");
    expect(() => verifyAcquisitionTrackedBytes({
      cwd: "/repo",
      spawnSyncImpl: spawnWith(stdout),
    })).toThrow("entry limit");
  });
});
