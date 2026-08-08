import { describe, expect, it } from "vitest";
import {
  evaluateLockfileChange,
  runLockfileChangeControl,
} from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);

function lock(packages: Record<string, unknown>, version = "0.1.0") {
  return {
    name: "noema",
    version,
    lockfileVersion: 3,
    requires: true,
    packages,
  };
}

function policy(targetPackages: string[], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    baseSha: BASE_SHA,
    targetPackages,
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

  it("allows exactly the package nodes declared by a current evidence policy", () => {
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
        policy: policy(["node_modules/nanoid"]),
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({
      passed: true,
      changedPackages: ["node_modules/nanoid"],
      failures: [],
    });
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
      policy: policy(["node_modules/nanoid"]),
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
        policy: policy(["node_modules/nanoid"], { baseSha: "2".repeat(40) }),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("lockfile change policy baseSha must equal the exact pull-request base SHA");
  });

  it("rejects malformed, unbounded, duplicated, or non-HTTPS policy evidence", () => {
    const baseLock = lock({ "node_modules/nanoid": { version: "3.3.16" } });
    const headLock = lock({ "node_modules/nanoid": { version: "3.3.17" } });
    const cases = [
      policy(["node_modules/nanoid"], { schemaVersion: 2 }),
      policy([]),
      policy(["node_modules/nanoid", "node_modules/nanoid"]),
      policy(["../nanoid"]),
      policy(["node_modules/nanoid"], { justification: "" }),
      policy(["node_modules/nanoid"], { sources: [] }),
      policy(["node_modules/nanoid"], { sources: ["http://example.test/advisory"] }),
    ];
    for (const candidate of cases) {
      const result = evaluateLockfileChange({
        baseLock,
        headLock,
        policy: candidate,
        expectedBaseSha: BASE_SHA,
      });
      expect(result.passed).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
    }
  });

  it("rejects unsupported top-level lock metadata movement and malformed lock objects", () => {
    const baseLock = lock({ "": { name: "noema" } });
    const headLock = lock({ "": { name: "noema" } }, "0.2.0");
    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy: policy([""]),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("package-lock top-level metadata changed outside the packages map");

    expect(
      evaluateLockfileChange({
        baseLock: null,
        headLock,
        policy: policy([""]),
        expectedBaseSha: BASE_SHA,
      }).failures,
    ).toContain("base and head package-lock documents must be objects with a packages map");
  });

  it("reads bounded JSON inputs and returns a fail-closed report for CI", () => {
    const files = new Map<string, string>([
      ["/base-lock.json", JSON.stringify(lock({ "node_modules/nanoid": { version: "3.3.16" } }))],
      ["package-lock.json", JSON.stringify(lock({ "node_modules/nanoid": { version: "3.3.17" } }))],
      [
        ".github/lockfile-change-policy.json",
        JSON.stringify(policy(["node_modules/nanoid"])),
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
});
