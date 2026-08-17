import { describe, expect, it } from "vitest";
import {
  evaluateLockfileChange,
  lockfileMetadataDigest,
  lockfilePackagesDigest,
  packageObjectDigest,
  runLockfileChangeControl,
} from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);
const STANDARD_PACKAGE_LIMIT = 128;
const ABSOLUTE_PACKAGE_LIMIT = 1_024;

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

function bulkEvidence(baseLock: LockDocument, headLock: LockDocument, targetPackageCount: number) {
  return {
    targetPackageCount,
    beforePackagesSha256: lockfilePackagesDigest(baseLock),
    afterPackagesSha256: lockfilePackagesDigest(headLock),
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
    justification: "Reviewed release or dependency transition with exact digest evidence.",
    sources: ["https://docs.npmjs.com/cli/v11/configuring-npm/package-lock-json"],
    ...overrides,
  };
}

describe("lockfile change-control schemaVersion 3", () => {
  it("permits a release version change only when exact top-level and package metadata are bound", () => {
    const baseLock = lock({ "": { name: "noema", version: "0.1.0" } }, "0.1.0");
    const headLock = lock({ "": { name: "noema", version: "0.2.0" } }, "0.2.0");

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, [""]),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: [""], failures: [] });
  });

  it("supports an exact top-level-only transition without manufacturing package targets", () => {
    const packages = { "": { name: "noema" } };
    const baseLock = lock(packages, "0.1.0");
    const headLock = lock(structuredClone(packages), "0.2.0");

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, []),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: [], failures: [] });
  });

  it("rejects omitted or substituted top-level metadata digest evidence", () => {
    const baseLock = lock({ "": { name: "noema", version: "0.1.0" } }, "0.1.0");
    const headLock = lock({ "": { name: "noema", version: "0.2.0" } }, "0.2.0");
    const expectedFailure =
      "lockfile change policy must bind exact before and after top-level metadata digests";

    for (const topLevelMetadataDigests of [
      undefined,
      {},
      {
        beforeSha256: "0".repeat(64),
        afterSha256: lockfileMetadataDigest(headLock),
      },
      {
        beforeSha256: lockfileMetadataDigest(baseLock),
        afterSha256: lockfileMetadataDigest(headLock),
        extra: "unreviewed",
      },
    ]) {
      const result = evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, [""], { topLevelMetadataDigests }),
        expectedBaseSha: BASE_SHA,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toContain(expectedFailure);
    }
  });

  it("requires exact bulk package-set evidence above the standard review limit", () => {
    const targets = Array.from(
      { length: STANDARD_PACKAGE_LIMIT + 1 },
      (_, index) => `node_modules/package-${index.toString().padStart(3, "0")}`,
    );
    const baseLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "1.0.0" }])));
    const headLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "2.0.0" }])));
    const expectedFailure =
      "lockfile change policy requires exact bulk package-set evidence above 128 changed packages";

    const ordinaryPolicy = policyFor(baseLock, headLock, targets);
    const ordinaryResult = evaluateLockfileChange({
      baseLock,
      headLock,
      policy: ordinaryPolicy,
      expectedBaseSha: BASE_SHA,
    });
    expect(ordinaryResult.passed).toBe(false);
    expect(ordinaryResult.failures).toContain(expectedFailure);

    const reviewedBulkPolicy = policyFor(baseLock, headLock, targets, {
      bulkChange: bulkEvidence(baseLock, headLock, targets.length),
    });
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: reviewedBulkPolicy,
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({ passed: true, changedPackages: targets, failures: [] });
  });

  it("rejects malformed, substituted, and unnecessary bulk package-set evidence", () => {
    const smallBaseLock = lock({ "node_modules/a": { version: "1.0.0" } });
    const smallHeadLock = lock({ "node_modules/a": { version: "2.0.0" } });
    expect(
      evaluateLockfileChange({
        baseLock: smallBaseLock,
        headLock: smallHeadLock,
        policy: policyFor(smallBaseLock, smallHeadLock, ["node_modules/a"], {
          bulkChange: bulkEvidence(smallBaseLock, smallHeadLock, 1),
        }),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("lockfile change policy bulkChange must be null at or below 128 changed packages");

    const targets = Array.from(
      { length: STANDARD_PACKAGE_LIMIT + 1 },
      (_, index) => `node_modules/bulk-${index.toString().padStart(3, "0")}`,
    );
    const baseLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "1.0.0" }])));
    const headLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "2.0.0" }])));
    const validBulk = bulkEvidence(baseLock, headLock, targets.length);
    const expectedFailure =
      "lockfile change policy requires exact bulk package-set evidence above 128 changed packages";

    for (const bulkChange of [
      {},
      { ...validBulk, targetPackageCount: targets.length - 1 },
      { ...validBulk, beforePackagesSha256: "0".repeat(64) },
      { ...validBulk, afterPackagesSha256: "1".repeat(64) },
      { ...validBulk, extra: "unreviewed" },
    ]) {
      const result = evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policyFor(baseLock, headLock, targets, { bulkChange }),
        expectedBaseSha: BASE_SHA,
      });
      expect(result.passed).toBe(false);
      expect(result.failures).toContain(expectedFailure);
    }
  });

  it("retains an absolute package-count ceiling even with bulk evidence", () => {
    const targets = Array.from(
      { length: ABSOLUTE_PACKAGE_LIMIT + 1 },
      (_, index) => `node_modules/absolute-${index.toString().padStart(4, "0")}`,
    );
    const baseLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "1.0.0" }])));
    const headLock = lock(Object.fromEntries(targets.map((key) => [key, { version: "2.0.0" }])));
    const result = evaluateLockfileChange({
      baseLock,
      headLock,
      policy: policyFor(baseLock, headLock, targets, {
        bulkChange: bulkEvidence(baseLock, headLock, targets.length),
      }),
      expectedBaseSha: BASE_SHA,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      "lockfile change policy targetPackages must be a bounded unique canonical package-key list",
    );
  });

  it("rejects predecessor schemaVersion 2 instead of silently assigning new meaning", () => {
    const baseLock = lock({ "node_modules/a": { version: "1.0.0" } });
    const headLock = lock({ "node_modules/a": { version: "2.0.0" } });
    const policy = policyFor(baseLock, headLock, ["node_modules/a"], {
      schemaVersion: 2,
    });
    const result = evaluateLockfileChange({
      baseLock,
      headLock,
      policy,
      expectedBaseSha: BASE_SHA,
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain("lockfile change policy schemaVersion must equal 3");
  });

  it("reports the operational missing-policy reason when the policy file is absent", () => {
    const baseLock = lock({ "node_modules/a": { version: "1.0.0" } });
    const headLock = lock({ "node_modules/a": { version: "2.0.0" } });
    const files = new Map<string, string>([
      ["/base-lock.json", JSON.stringify(baseLock)],
      ["package-lock.json", JSON.stringify(headLock)],
    ]);

    const result = runLockfileChangeControl({
      environment: {
        NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
        NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
      },
      readText: (path: string) => {
        const value = files.get(path);
        if (value === undefined) {
          throw Object.assign(new Error("missing policy"), { code: "ENOENT" });
        }
        return value;
      },
    });

    expect(result.passed).toBe(false);
    expect(result.failures).toContain(
      "changed package-lock.json requires a reviewed lockfile change policy",
    );
  });
});
