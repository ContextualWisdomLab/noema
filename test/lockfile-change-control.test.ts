import { describe, expect, it } from "vitest";
import {
  evaluateLockfileChange,
  lockfileMetadataDigest,
  packageObjectDigest,
  runLockfileChangeControl,
} from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);

type LockDocument = ReturnType<typeof lock>;

function lock(packages: Record<string, unknown>, version = "0.1.0") {
  return {
    name: "noema",
    version,
    lockfileVersion: 3,
    requires: true,
    packages,
  };
}

function policyFor(
  baseLock: LockDocument,
  headLock: LockDocument,
  targetPackages: string[],
  overrides: Record<string, unknown> = {},
) {
  return {
    schemaVersion: 3,
    baseSha: BASE_SHA,
    targetPackages,
    packageDigests: Object.fromEntries(
      targetPackages.map((packagePath) => [
        packagePath,
        {
          beforeSha256: packageObjectDigest(baseLock.packages[packagePath]),
          afterSha256: packageObjectDigest(headLock.packages[packagePath]),
        },
      ]),
    ),
    topLevelMetadataDigests: {
      beforeSha256: lockfileMetadataDigest(baseLock),
      afterSha256: lockfileMetadataDigest(headLock),
    },
    bulkChange: null,
    justification: "Targeted dependency remediation with reviewed source evidence.",
    sources: ["https://github.com/advisories/GHSA-2v37-7h3g-55p8"],
    ...overrides,
  };
}

describe("lockfile change control", () => {
  it("allows an unchanged lockfile without manufacturing policy evidence", () => {
    const current = lock({ "": { name: "noema" } });
    expect(
      evaluateLockfileChange({
        baseLock: current,
        headLock: structuredClone(current),
        policy: undefined,
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: [], failures: [] });
  });

  it("allows exactly the package nodes and exact metadata declared by a current evidence policy", () => {
    const baseLock = lock({
      "": { name: "noema" },
      "node_modules/nanoid": { version: "3.3.16", integrity: "sha512-old" },
    });
    const headLock = lock({
      "": { name: "noema" },
      "node_modules/nanoid": { version: "3.3.17", integrity: "sha512-new" },
    });
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, ["node_modules/nanoid"]),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({
      passed: true,
      changedPackages: ["node_modules/nanoid"],
      failures: [],
    });
  });

  it("allows exact-bound package creation and deletion without confusing absence with JSON null", () => {
    const baseLock = lock({
      "node_modules/removed": { version: "1.0.0" },
    });
    const headLock = lock({
      "node_modules/added": { version: "2.0.0" },
    });
    const targets = ["node_modules/added", "node_modules/removed"];

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, targets),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({
      passed: true,
      changedPackages: targets,
      failures: [],
    });
    expect(packageObjectDigest(undefined)).not.toBe(packageObjectDigest(null));
  });

  it("hashes package objects canonically regardless of JSON object key order", () => {
    expect(
      packageObjectDigest({ version: "3.3.17", nested: { b: 2, a: 1 } }),
    ).toBe(
      packageObjectDigest({ nested: { a: 1, b: 2 }, version: "3.3.17" }),
    );
  });

  it("rejects unsupported non-JSON values when package evidence is hashed", () => {
    expect(() => packageObjectDigest({ version: Number.POSITIVE_INFINITY })).toThrow(
      "canonical JSON evidence requires finite numbers",
    );
    expect(() => packageObjectDigest({ invalid: undefined })).toThrow(
      "canonical JSON evidence contains an unsupported value",
    );
  });

  it("fails closed when unrelated package metadata churn is not declared", () => {
    const baseLock = lock({
      "": { name: "noema" },
      "node_modules/@esbuild/linux-x64": { resolved: "https://registry.npmjs.org/old" },
      "node_modules/nanoid": { version: "3.3.16" },
    });
    const headLock = lock({
      "": { name: "noema" },
      "node_modules/@esbuild/linux-x64": { resolved: "https://registry.npmjs.org/new" },
      "node_modules/nanoid": { version: "3.3.17" },
    });
    const result = evaluateLockfileChange({
      baseLock,
      headLock,
      policy: policyFor(baseLock, headLock, ["node_modules/nanoid"]),
      expectedBaseSha: BASE_SHA,
    });
    expect(result.passed).toBe(false);
    expect(result.changedPackages).toEqual([
      "node_modules/@esbuild/linux-x64",
      "node_modules/nanoid",
    ]);
    expect(result.failures).toContain(
      "policy targetPackages must exactly match every changed package-lock packages key",
    );
  });

  it("rejects changed lockfiles without complete exact-base provenance", () => {
    const baseLock = lock({ "node_modules/nanoid": { version: "3.3.16" } });
    const headLock = lock({ "node_modules/nanoid": { version: "3.3.17" } });

    expect(
      evaluateLockfileChange({ baseLock, headLock, policy: undefined, expectedBaseSha: BASE_SHA })
        .failures,
    ).toContain("changed package-lock.json requires a reviewed lockfile change policy");

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, ["node_modules/nanoid"], { baseSha: "2".repeat(40) }),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("lockfile change policy baseSha must equal the exact pull-request base SHA");
  });

  it("rejects malformed, unbounded, duplicated, or non-HTTPS policy evidence with specific reasons", () => {
    const baseLock = lock({ "node_modules/nanoid": { version: "3.3.16" } });
    const headLock = lock({ "node_modules/nanoid": { version: "3.3.17" } });
    const valid = policyFor(baseLock, headLock, ["node_modules/nanoid"]);
    const cases: Array<{ policy: Record<string, unknown>; expected: string }> = [
      {
        policy: { ...valid, schemaVersion: 1 },
        expected: "lockfile change policy schemaVersion must equal 3",
      },
      {
        policy: { ...valid, targetPackages: [] },
        expected: "policy targetPackages must exactly match every changed package-lock packages key",
      },
      {
        policy: { ...valid, targetPackages: ["node_modules/nanoid", "node_modules/nanoid"] },
        expected: "lockfile change policy targetPackages must be a bounded unique canonical package-key list",
      },
      {
        policy: { ...valid, targetPackages: ["../nanoid"] },
        expected: "lockfile change policy targetPackages must be a bounded unique canonical package-key list",
      },
      {
        policy: { ...valid, justification: "" },
        expected: "lockfile change policy requires a bounded non-empty justification",
      },
      {
        policy: { ...valid, sources: [] },
        expected: "lockfile change policy requires bounded HTTPS source evidence",
      },
      {
        policy: { ...valid, sources: ["http://example.test/advisory"] },
        expected: "lockfile change policy requires bounded HTTPS source evidence",
      },
      {
        policy: { ...valid, packageDigests: undefined },
        expected: "lockfile change policy must bind exact before and after package object digests",
      },
      {
        policy: { ...valid, packageDigests: {} },
        expected: "lockfile change policy must bind exact before and after package object digests",
      },
      {
        policy: {
          ...valid,
          packageDigests: {
            "node_modules/nanoid": { beforeSha256: "0".repeat(64) },
          },
        },
        expected: "lockfile change policy must bind exact before and after package object digests",
      },
      {
        policy: {
          ...valid,
          packageDigests: {
            "node_modules/nanoid": {
              beforeSha256: "0".repeat(64),
              afterSha256: "1".repeat(64),
              extra: "not-reviewed",
            },
          },
        },
        expected: "lockfile change policy must bind exact before and after package object digests",
      },
    ];
    for (const { policy, expected } of cases) {
      const result = evaluateLockfileChange({
        baseLock,
        headLock,
        policy,
        expectedBaseSha: BASE_SHA,
      });
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expect(result.failures).toContain(expected);
    }
  });

  it("allows explicitly bound top-level lock metadata movement and rejects malformed lock objects", () => {
    const baseLock = lock({ "": { name: "noema" } });
    const headLock = lock({ "": { name: "noema" } }, "0.2.0");
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, []),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: [], failures: [] });

    expect(
      evaluateLockfileChange({
        baseLock: null,
        headLock,
        policy: policyFor(baseLock, headLock, []),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("base and head package-lock documents must be objects with a packages map");
  });

  it("reads bounded JSON inputs and returns a fail-closed report for CI", () => {
    const baseLock = lock({ "node_modules/nanoid": { version: "3.3.16" } });
    const headLock = lock({ "node_modules/nanoid": { version: "3.3.17" } });
    const files = new Map<string, string>([
      ["/base-lock.json", JSON.stringify(baseLock)],
      ["package-lock.json", JSON.stringify(headLock)],
      [
        ".github/lockfile-change-policy.json",
        JSON.stringify(policyFor(baseLock, headLock, ["node_modules/nanoid"])),
      ],
    ]);
    const result = runLockfileChangeControl({
      environment: {
        NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
        NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
      },
      readText: (path, maximumBytes) => {
        const value = files.get(path);
        if (value === undefined || Buffer.byteLength(value) > maximumBytes) {
          throw new Error("bounded read rejected");
        }
        return value;
      },
    });
    expect(result).toEqual({
      passed: true,
      changedPackages: ["node_modules/nanoid"],
      failures: [],
    });

    expect(
      runLockfileChangeControl({
        environment: {},
        readText: () => {
          throw new Error("should not read without required base context");
        },
      }),
    ).toEqual({
      passed: false,
      changedPackages: [],
      failures: ["exact pull-request base lock path and SHA are required"],
    });
  });

  it("rejects a path-only policy that does not bind the exact before and after package objects", () => {
    const baseLock = lock({
      "node_modules/nanoid": {
        version: "3.3.16",
        resolved: "https://registry.npmjs.org/nanoid/-/nanoid-3.3.16.tgz",
        integrity: "sha512-old",
      },
    });
    const reviewedHeadLock = lock({
      "node_modules/nanoid": {
        version: "3.3.17",
        resolved: "https://registry.npmjs.org/nanoid/-/nanoid-3.3.17.tgz",
        integrity: "sha512-reviewed",
      },
    });
    const tamperedHeadLock = lock({
      "node_modules/nanoid": {
        version: "3.3.17",
        resolved: "https://attacker.invalid/nanoid-3.3.17.tgz",
        integrity: "sha512-attacker-controlled",
      },
    });
    const result = evaluateLockfileChange({
      baseLock,
      headLock: tamperedHeadLock,
      policy: policyFor(baseLock, reviewedHeadLock, ["node_modules/nanoid"]),
      expectedBaseSha: BASE_SHA,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      "lockfile change policy must bind exact before and after package object digests",
    );
  });
});
