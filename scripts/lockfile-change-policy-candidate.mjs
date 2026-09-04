import { readFileSync } from "node:fs";
import {
  lockfileMetadataDigest,
  lockfilePackagesDigest,
  packageObjectDigest,
} from "./lockfile-change-control.mjs";

function parseLockfile(path) {
  const value = JSON.parse(readFileSync(path, "utf8"));
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`lockfile at ${path} must be a JSON object`);
  }
  if (value.packages === null || typeof value.packages !== "object" || Array.isArray(value.packages)) {
    throw new Error(`lockfile at ${path} must contain a packages object`);
  }
  return value;
}

/**
 * Build exact schema-v3 lockfile change-control evidence from one reviewed base/head pair.
 *
 * The candidate is diagnostic only: writing it to the policy file still requires review of the
 * changed package set, justification, and source provenance. Reusing the enforcement gate's
 * exported digest functions prevents an independent hashing implementation from drifting.
 */
export function buildLockfileChangePolicyCandidate({ basePath, headPath, baseSha }) {
  if (typeof baseSha !== "string" || !/^[0-9a-f]{40}$/u.test(baseSha)) {
    throw new Error("candidate generation requires an exact lowercase 40-character base SHA");
  }
  const base = parseLockfile(basePath);
  const head = parseLockfile(headPath);
  const packageKeys = [...new Set([
    ...Object.keys(base.packages),
    ...Object.keys(head.packages),
  ])].sort();
  const targetPackages = packageKeys.filter(
    (packagePath) => packageObjectDigest(base.packages[packagePath]) !== packageObjectDigest(head.packages[packagePath]),
  );
  const packageDigests = Object.fromEntries(
    targetPackages.map((packagePath) => [
      packagePath,
      {
        afterSha256: packageObjectDigest(head.packages[packagePath]),
        beforeSha256: packageObjectDigest(base.packages[packagePath]),
      },
    ]),
  );
  const bulkChange = targetPackages.length <= 128
    ? null
    : {
        afterPackagesSha256: lockfilePackagesDigest(head),
        beforePackagesSha256: lockfilePackagesDigest(base),
        targetPackageCount: targetPackages.length,
      };
  return {
    baseSha,
    bulkChange,
    justification: "REVIEW REQUIRED: describe why this exact lockfile package set changes and what unrelated package metadata is preserved.",
    packageDigests,
    schemaVersion: 3,
    sources: ["https://review-required.invalid/replace-with-reviewed-provenance"],
    targetPackages,
    topLevelMetadataDigests: {
      afterSha256: lockfileMetadataDigest(head),
      beforeSha256: lockfileMetadataDigest(base),
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const basePath = process.env.NOEMA_LOCKFILE_BASE_PATH;
  const baseSha = process.env.NOEMA_LOCKFILE_BASE_SHA;
  if (!basePath || !baseSha) {
    throw new Error("NOEMA_LOCKFILE_BASE_PATH and NOEMA_LOCKFILE_BASE_SHA are required");
  }
  const candidate = buildLockfileChangePolicyCandidate({
    basePath,
    headPath: "package-lock.json",
    baseSha,
  });
  process.stdout.write(`${JSON.stringify(candidate, null, 2)}\n`);
}
