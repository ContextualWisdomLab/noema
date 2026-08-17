import { describe, expect, it } from "vitest";
import {
  packageObjectDigest,
  runLockfileChangeControl,
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

function policy(baseLock: ReturnType<typeof lock>, headLock: ReturnType<typeof lock>) {
  return {
    schemaVersion: 2,
    baseSha: BASE_SHA,
    targetPackages: ["node_modules/nanoid"],
    packageDigests: {
      "node_modules/nanoid": {
        beforeSha256: packageObjectDigest(baseLock.packages["node_modules/nanoid"]),
        afterSha256: packageObjectDigest(headLock.packages["node_modules/nanoid"]),
      },
    },
    justification: "Reviewed nanoid security remediation.",
    sources: ["https://github.com/advisories/GHSA-2v37-7h3g-55p8"],
  };
}

function duplicateObjectKey(text: string, original: string, duplicate: string): string {
  const index = text.indexOf(original);
  if (index < 0) {
    throw new Error(`fixture token not found: ${original}`);
  }
  return `${text.slice(0, index)}${duplicate}${text.slice(index + original.length)}`;
}

describe("lockfile change-control unambiguous JSON evidence", () => {
  it.each(["base", "head", "policy"] as const)(
    "rejects duplicate decoded object keys in %s JSON",
    (duplicateTarget) => {
      const baseLock = lock("3.3.16");
      const headLock = lock("3.3.17");
      const reviewedPolicy = policy(baseLock, headLock);
      let baseText = JSON.stringify(baseLock);
      let headText = JSON.stringify(headLock);
      let policyText = JSON.stringify(reviewedPolicy);

      if (duplicateTarget === "base") {
        baseText = duplicateObjectKey(
          baseText,
          '"name":"noema"',
          '"name":"noema","n\\u0061me":"noema"',
        );
      } else if (duplicateTarget === "head") {
        headText = duplicateObjectKey(
          headText,
          '"name":"noema"',
          '"name":"noema","n\\u0061me":"noema"',
        );
      } else {
        policyText = duplicateObjectKey(
          policyText,
          `"baseSha":"${BASE_SHA}"`,
          `"baseSha":"${BASE_SHA}","base\\u0053ha":"${BASE_SHA}"`,
        );
      }

      const result = runLockfileChangeControl({
        environment: {
          NOEMA_LOCKFILE_BASE_PATH: "/base-lock.json",
          NOEMA_LOCKFILE_BASE_SHA: BASE_SHA,
        },
        readText: (path) => {
          if (path === "/base-lock.json") return baseText;
          if (path === "package-lock.json") return headText;
          if (path === ".github/lockfile-change-policy.json") return policyText;
          throw Object.assign(new Error("missing"), { code: "ENOENT" });
        },
      });

      expect(result).toEqual({
        passed: false,
        changedPackages: [],
        failures: ["lockfile change-control inputs must be bounded valid UTF-8 JSON"],
      });
    },
  );
});
