import { describe, expect, it } from "vitest";
import {
  evaluateLockfileChange,
  lockfileMetadataDigest,
  packageObjectDigest,
} from "../scripts/lockfile-change-control.mjs";

const BASE_SHA = "1".repeat(40);

function lock(version: string) {
  return {
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "node_modules/nanoid": { version },
    },
  };
}

function reviewedPolicy(baseLock: ReturnType<typeof lock>, headLock: ReturnType<typeof lock>) {
  return {
    schemaVersion: 3,
    baseSha: BASE_SHA,
    targetPackages: ["node_modules/nanoid"],
    packageDigests: {
      "node_modules/nanoid": {
        beforeSha256: packageObjectDigest(baseLock.packages["node_modules/nanoid"]),
        afterSha256: packageObjectDigest(headLock.packages["node_modules/nanoid"]),
      },
    },
    topLevelMetadataDigests: {
      beforeSha256: lockfileMetadataDigest(baseLock),
      afterSha256: lockfileMetadataDigest(headLock),
    },
    bulkChange: null,
    justification: "Reviewed nanoid security remediation.",
    sources: ["https://github.com/advisories/GHSA-2v37-7h3g-55p8"],
  };
}

describe("lockfile change-control policy schema", () => {
  it("rejects unknown top-level policy fields instead of implying unenforced semantics", () => {
    const baseLock = lock("3.3.16");
    const headLock = lock("3.3.17");
    const policy = {
      ...reviewedPolicy(baseLock, headLock),
      approvedBy: "looks-reviewed-but-is-not-enforced",
    };

    expect(
      evaluateLockfileChange({
        baseLock,
        headLock,
        policy,
        expectedBaseSha: BASE_SHA,
      }),
    ).toEqual({
      passed: false,
      changedPackages: ["node_modules/nanoid"],
      failures: ["lockfile change policy must use the closed schemaVersion 3 field set"],
    });
  });
});
