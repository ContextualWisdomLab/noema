import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildAcquisitionGitEnvironment,
  resolveAcquisitionCommit,
  verifyAcquisitionIndexFlags,
  verifyAcquisitionTrackedCheckout,
} from "../scripts/lib/acquisition-git-preflight.mjs";

const HEAD = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "89abcdef0123456789abcdef0123456789abcdef";
const SAFE_INDEX = "H tracked.txt\0";

function gitResult(overrides: Record<string, unknown> = {}) {
  return {
    status: 0,
    signal: null,
    error: undefined,
    stdout: `${HEAD}\n`,
    stderr: "",
    ...overrides,
  };
}

function spawnSequence(...results: Array<Record<string, unknown>>) {
  const mock = vi.fn();
  results.forEach((result) => mock.mockReturnValueOnce(gitResult(result)));
  return mock;
}

function createCleanRepository() {
  const root = mkdtempSync(join(tmpdir(), "noema-acquisition-git-clean-"));
  writeFileSync(join(root, "tracked.txt"), "tracked\n");
  const commands = [
    ["init", "--quiet"],
    ["add", "tracked.txt"],
    ["-c", "user.name=Noema Tests", "-c", "user.email=noema-tests@example.invalid", "commit", "--quiet", "-m", "fixture"],
  ];
  for (const args of commands) {
    const result = spawnSync("git", args, { cwd: root, encoding: "utf8", timeout: 10_000 });
    if (result.status !== 0) {
      rmSync(root, { recursive: true, force: true });
      throw new Error(`failed to create Git fixture: ${result.stderr}`);
    }
  }
  return root;
}

describe("acquisition Git preflight", () => {
  it("builds a configuration-isolated POSIX environment without inheriting unrelated variables", () => {
    const environment = buildAcquisitionGitEnvironment({ PATH: "/bin", HOME: "/secret" }, "linux");
    expect(environment).toMatchObject({
      PATH: "/bin",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_NO_REPLACE_OBJECTS: "1",
      GIT_NO_LAZY_FETCH: "1",
      GIT_CONFIG_VALUE_0: "/dev/null",
    });
    expect(environment).not.toHaveProperty("HOME");
    expect(environment).not.toHaveProperty("SystemRoot");
  });

  it("preserves only required Windows process discovery values", () => {
    const environment = buildAcquisitionGitEnvironment({
      PATH: "C:\\Git\\bin",
      SystemRoot: "C:\\Windows",
      USERPROFILE: "C:\\Users\\secret",
    }, "win32");
    expect(environment.GIT_CONFIG_GLOBAL).toBe("NUL");
    expect(environment.GIT_CONFIG_VALUE_0).toBe("NUL");
    expect(environment.PATH).toBe("C:\\Git\\bin");
    expect(environment.SystemRoot).toBe("C:\\Windows");
    expect(environment).not.toHaveProperty("USERPROFILE");
  });

  it("omits empty discovery variables instead of forwarding them", () => {
    const posix = buildAcquisitionGitEnvironment({ PATH: "" }, "linux");
    const windows = buildAcquisitionGitEnvironment({ PATH: "", SystemRoot: "" }, "win32");
    expect(posix).not.toHaveProperty("PATH");
    expect(windows).not.toHaveProperty("PATH");
    expect(windows).not.toHaveProperty("SystemRoot");
  });

  it("omits absent or non-string discovery variables", () => {
    const windows = buildAcquisitionGitEnvironment({
      PATH: 7 as never,
      SystemRoot: 9 as never,
    }, "win32");
    const absent = buildAcquisitionGitEnvironment({}, "linux");
    expect(windows).not.toHaveProperty("PATH");
    expect(windows).not.toHaveProperty("SystemRoot");
    expect(absent).not.toHaveProperty("PATH");
    expect(absent).not.toHaveProperty("SystemRoot");
  });

  it.each([
    [null, "non-string"],
    ["", "empty"],
    ["a".repeat(257), "oversized"],
    ["bad\nref", "control-character"],
  ])("rejects %s Git refs before spawning Git (%s)", (ref) => {
    const spawn = vi.fn();
    expect(() => resolveAcquisitionCommit(ref as never, { cwd: "/repo", spawnSyncImpl: spawn }))
      .toThrow("acquisition Git ref must be a bounded printable string");
    expect(spawn).not.toHaveBeenCalled();
  });

  it("resolves a local revision with bounded isolated Git options", () => {
    const spawn = spawnSequence({});
    expect(resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawn,
      sourceEnvironment: { PATH: "/bin" },
      platform: "linux",
    })).toBe(HEAD);
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["rev-parse", "--verify", "--end-of-options", "HEAD^{commit}"],
      expect.objectContaining({ cwd: "/repo", maxBuffer: 4096, timeout: 10_000 }),
    );
  });

  it("fails closed on spawn errors, signals, absent status, nonzero resolution, and malformed output", () => {
    expect(() => resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ error: new Error("spawn failed"), status: null }),
    })).toThrow("acquisition Git preflight failed: spawn failed");

    expect(() => resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ signal: "SIGTERM", status: null }),
    })).toThrow("acquisition Git preflight terminated by signal SIGTERM");

    expect(() => resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ status: null }),
    })).toThrow("acquisition Git preflight returned no exit status");

    expect(() => resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ status: 128 }),
    })).toThrow("acquisition Git ref HEAD could not be resolved locally");

    expect(() => resolveAcquisitionCommit("HEAD", {
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: null }),
    })).toThrow("acquisition Git ref HEAD did not resolve to one exact commit");
  });

  it("accepts safe bounded NUL-delimited index state", () => {
    const spawn = spawnSequence({ stdout: "H tracked.txt\0M merge.txt\0" });
    expect(() => verifyAcquisitionIndexFlags({ cwd: "/repo", spawnSyncImpl: spawn })).not.toThrow();
    expect(spawn).toHaveBeenCalledWith(
      "git",
      ["ls-files", "-v", "-z", "--cached", "--"],
      expect.objectContaining({ maxBuffer: 2 * 1024 * 1024, timeout: 10_000 }),
    );
  });

  it("accepts an empty tracked index and the null-stdout defensive fallback", () => {
    expect(() => verifyAcquisitionIndexFlags({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: "" }),
    })).not.toThrow();
    expect(() => verifyAcquisitionIndexFlags({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout: null }),
    })).not.toThrow();
  });

  it("fails closed when index inspection itself fails", () => {
    expect(() => verifyAcquisitionIndexFlags({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ status: 2, stdout: "" }),
    })).toThrow("acquisition Git index inspection failed");
  });

  it.each([
    ["unterminated", "H tracked.txt"],
    ["short record", "H\0"],
    ["missing separator", "H:tracked.txt\0"],
  ])("rejects malformed index output: %s", (_label, stdout) => {
    expect(() => verifyAcquisitionIndexFlags({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout }),
    })).toThrow("acquisition Git index inspection returned malformed output");
  });

  it.each([
    ["skip-worktree", "S tracked.txt\0"],
    ["assume-unchanged", "h tracked.txt\0"],
    ["combined lower-case skip flag", "s tracked.txt\0"],
  ])("rejects %s index state", (_label, stdout) => {
    expect(() => verifyAcquisitionIndexFlags({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({ stdout }),
    })).toThrow("unsafe Git index flag detected in acquisition checkout");
  });

  it("allows intentionally untracked retained artifacts while authenticating tracked bytes", () => {
    const root = createCleanRepository();
    try {
      writeFileSync(join(root, "untracked-acquisition-evidence.json"), "{}\n");
      const exactHead = resolveAcquisitionCommit("HEAD", { cwd: root });
      expect(verifyAcquisitionTrackedCheckout({ cwd: root, expectedCommitSha: exactHead })).toBe(exactHead);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  const trackedTreeCheck = spawnSync("git", ["diff", "--quiet", "HEAD", "--"], {
    cwd: process.cwd(),
    timeout: 10_000,
  });
  if (trackedTreeCheck.error) {
    throw new Error(`failed to inspect tracked repository state: ${trackedTreeCheck.error.message}`);
  }
  if (trackedTreeCheck.signal) {
    throw new Error(`tracked repository state inspection terminated by signal ${trackedTreeCheck.signal}`);
  }
  if (trackedTreeCheck.status === null) {
    throw new Error("tracked repository state inspection returned no exit status");
  }
  if (trackedTreeCheck.status !== 0 && trackedTreeCheck.status !== 1) {
    throw new Error(`tracked repository state inspection failed with exit status ${trackedTreeCheck.status}`);
  }
  const trackedTreeIsClean = trackedTreeCheck.status === 0;

  it.skipIf(!trackedTreeIsClean)("supports production defaults on a clean repository checkout", () => {
    const exactHead = resolveAcquisitionCommit("HEAD");
    expect(exactHead).toMatch(/^[0-9a-f]{40}$/);
    expect(() => verifyAcquisitionIndexFlags()).not.toThrow();
    expect(verifyAcquisitionTrackedCheckout()).toBe(exactHead);
  });

  it("rejects an invalid or stale explicit expected commit before index or diff authorization", () => {
    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      expectedCommitSha: "not-a-sha",
      spawnSyncImpl: spawnSequence({}),
    })).toThrow("expected acquisition commit must be a full Git SHA");

    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      expectedCommitSha: OTHER,
      spawnSyncImpl: spawnSequence({}),
    })).toThrow("exact HEAD changed from the expected acquisition commit");
  });

  it("rejects tracked drift and Git comparison errors", () => {
    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        {},
        { stdout: SAFE_INDEX },
        { status: 1, stdout: "" },
      ),
    })).toThrow(`tracked checkout differs from exact HEAD ${HEAD}`);

    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        {},
        { stdout: SAFE_INDEX },
        { status: 2, stdout: "" },
      ),
    })).toThrow("acquisition tracked-checkout comparison failed");
  });

  it("rejects unsafe index state discovered before or after tracked comparison", () => {
    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence({}, { stdout: "S tracked.txt\0" }),
    })).toThrow("unsafe Git index flag detected in acquisition checkout");

    expect(() => verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      spawnSyncImpl: spawnSequence(
        {},
        { stdout: SAFE_INDEX },
        { status: 0, stdout: "" },
        { stdout: "h tracked.txt\0" },
      ),
    })).toThrow("unsafe Git index flag detected in acquisition checkout");
  });

  it("rejects HEAD movement between the pre- and post-diff resolutions", () => {
    const spawn = spawnSequence(
      {},
      { stdout: SAFE_INDEX },
      { status: 0, stdout: "" },
      { stdout: SAFE_INDEX },
      { stdout: `${OTHER}\n` },
    );
    expect(() => verifyAcquisitionTrackedCheckout({ cwd: "/repo", spawnSyncImpl: spawn }))
      .toThrow("exact HEAD changed during acquisition Git preflight");
  });

  it("returns the authenticated exact HEAD when tracked bytes remain stable", () => {
    const spawn = spawnSequence(
      {},
      { stdout: SAFE_INDEX },
      { status: 0, stdout: "" },
      { stdout: SAFE_INDEX },
      {},
    );
    expect(verifyAcquisitionTrackedCheckout({
      cwd: "/repo",
      expectedCommitSha: HEAD.toUpperCase(),
      spawnSyncImpl: spawn,
    })).toBe(HEAD);
  });
});
