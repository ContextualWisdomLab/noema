import { afterEach, describe, expect, it, vi } from "vitest";

const BASE_SHA = "1".repeat(40);

function regularStat(size: number, inode = 1) {
  return {
    dev: 1,
    ino: inode,
    mode: 0o100600,
    size,
    isFile: () => true,
  };
}

async function importWithFsMock(overrides: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock("node:fs", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs")>();
    return {
      ...actual,
      ...overrides,
    };
  });
  return import("../scripts/lockfile-change-control.mjs");
}

afterEach(() => {
  vi.doUnmock("node:fs");
  vi.resetModules();
});

describe.sequential("lockfile change-control race boundaries", () => {
  it("accepts the canonical package-lock root package key when its exact metadata is explicitly reviewed", async () => {
    const { evaluateLockfileChange, lockfileMetadataDigest, packageObjectDigest } = await import(
      "../scripts/lockfile-change-control.mjs"
    );
    const baseLock = {
      name: "noema",
      version: "0.1.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "noema", version: "0.1.0" } },
    };
    const headLock = {
      ...baseLock,
      packages: { "": { name: "noema", version: "0.2.0" } },
    };

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: {
          schemaVersion: 3,
          baseSha: BASE_SHA,
          targetPackages: [""],
          packageDigests: {
            "": {
              beforeSha256: packageObjectDigest(baseLock.packages[""]),
              afterSha256: packageObjectDigest(headLock.packages[""]),
            },
          },
          topLevelMetadataDigests: {
            beforeSha256: lockfileMetadataDigest(baseLock),
            afterSha256: lockfileMetadataDigest(headLock),
          },
          bulkChange: null,
          justification: "Reviewed root package metadata update.",
          sources: ["https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json"],
        },
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: [""], failures: [] });
  });

  it("rejects non-object package maps on either lockfile side", async () => {
    const { evaluateLockfileChange } = await import("../scripts/lockfile-change-control.mjs");
    const validLock = { packages: {} };
    const invalidLock = { packages: [] };

    for (const [baseLock, headLock] of [
      [invalidLock, validLock],
      [validLock, invalidLock],
    ]) {
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
        failures: ["base and head package-lock documents must be objects with a packages map"],
      });
    }
  });

  it("fails closed when no-follow descriptor semantics are unavailable", async () => {
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    const module = await importWithFsMock({
      constants: { ...actual.constants, O_NOFOLLOW: undefined },
    });

    expect(() => module.readBoundedUtf8("ignored", 1)).toThrow(
      "no-follow file reads are unavailable on this runtime",
    );
  });

  it("stops at the configured byte ceiling when a file grows after preflight", async () => {
    const closeSync = vi.fn();
    const module = await importWithFsMock({
      openSync: vi.fn(() => 17),
      fstatSync: vi.fn(() => regularStat(1)),
      readSync: vi.fn(() => 2),
      closeSync,
    });

    expect(() => module.readBoundedUtf8("growing.json", 1)).toThrow(
      "bounded UTF-8 input exceeded the byte ceiling while reading",
    );
    expect(closeSync).toHaveBeenCalledWith(17);
  });

  it("rejects descriptor identity drift after a bounded read", async () => {
    const closeSync = vi.fn();
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce(regularStat(4, 11))
      .mockReturnValueOnce(regularStat(4, 12));
    const readSync = vi.fn().mockReturnValueOnce(4).mockReturnValueOnce(0);
    const module = await importWithFsMock({
      openSync: vi.fn(() => 23),
      fstatSync,
      readSync,
      closeSync,
    });

    expect(() => module.readBoundedUtf8("replaced.json", 4)).toThrow(
      "bounded UTF-8 input changed while being read",
    );
    expect(closeSync).toHaveBeenCalledWith(23);
  });

  it("rejects same-size in-place mutation while a bounded read is in progress", async () => {
    const closeSync = vi.fn();
    const fstatSync = vi
      .fn()
      .mockReturnValueOnce({ ...regularStat(4, 11), mtimeMs: 100, ctimeMs: 200 })
      .mockReturnValueOnce({ ...regularStat(4, 11), mtimeMs: 101, ctimeMs: 201 });
    const readSync = vi.fn().mockReturnValueOnce(4).mockReturnValueOnce(0);
    const module = await importWithFsMock({
      openSync: vi.fn(() => 29),
      fstatSync,
      readSync,
      closeSync,
    });

    expect(() => module.readBoundedUtf8("mutated.json", 4)).toThrow(
      "bounded UTF-8 input changed while being read",
    );
    expect(closeSync).toHaveBeenCalledWith(29);
  });
});
