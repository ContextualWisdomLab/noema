import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
} from "node:fs";

/** Maximum package-lock input accepted by the change-control gate. */
export const MAX_LOCKFILE_BYTES = 8 * 1024 * 1024;
/** Maximum provenance-policy input accepted by the change-control gate. */
export const MAX_POLICY_BYTES = 64 * 1024;
const MAX_TARGET_PACKAGES = 128;
const MAX_JUSTIFICATION_CHARS = 4_000;
const MAX_SOURCES = 16;
const MAX_SOURCE_CHARS = 2_048;
const fullShaPattern = /^[0-9a-f]{40}$/;
const sha256Pattern = /^[0-9a-f]{64}$/;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true });

/** Return whether a value is a non-array JSON object. */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Return a recursively key-sorted JSON value for deterministic evidence hashing.
 * Unsupported JavaScript values and non-finite numbers are rejected instead of being
 * silently coerced by JSON.stringify, because two different inputs must never share a digest.
 */
function canonicalJsonValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("canonical JSON evidence requires finite numbers");
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalJsonValue(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJsonValue(value[key])]),
    );
  }
  throw new Error("canonical JSON evidence contains an unsupported value");
}

/** Return a stable comparison token for one already-parsed JSON value. */
function comparisonToken(value) {
  return JSON.stringify(canonicalJsonValue(value));
}

/**
 * Hash one package-lock package object, preserving the difference between absent and present entries.
 * The returned lowercase SHA-256 digest can be copied into a reviewed lockfile change policy so the
 * policy binds the exact before/after package metadata rather than only approving a package path.
 */
export function packageObjectDigest(value) {
  const envelope = value === undefined
    ? { present: false }
    : { present: true, value: canonicalJsonValue(value) };
  return createHash("sha256").update(JSON.stringify(envelope), "utf8").digest("hex");
}

/** Return whether a package-lock packages key is canonical enough for explicit review policy. */
function canonicalPackagePath(value) {
  if (value === "") {
    return true;
  }
  if (typeof value !== "string" || !value.startsWith("node_modules/")) {
    return false;
  }
  if (value.includes("\\") || value.includes("//")) {
    return false;
  }
  return value.split("/").every((component) => component !== "" && component !== "." && component !== "..");
}

/** Return whether a source URL is bounded HTTPS provenance evidence. */
function validSourceUrl(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_SOURCE_CHARS) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Read one UTF-8 regular file through a no-follow descriptor with an explicit byte ceiling.
 * The function refuses non-regular files, unsupported no-follow semantics, oversized input,
 * invalid UTF-8, and files whose descriptor metadata changes while they are being read.
 */
export function readBoundedUtf8(path, maximumBytes) {
  if (typeof path !== "string" || path.length === 0 || !Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("bounded UTF-8 read requires a path and positive safe byte ceiling");
  }
  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new Error("no-follow file reads are unavailable on this runtime");
  }

  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 0 || before.size > maximumBytes) {
      throw new Error("bounded UTF-8 input is not a safe regular file within the byte ceiling");
    }

    const chunks = [];
    let totalBytes = 0;
    while (totalBytes <= maximumBytes) {
      const remaining = maximumBytes + 1 - totalBytes;
      const buffer = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(buffer.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maximumBytes) {
      throw new Error("bounded UTF-8 input exceeded the byte ceiling while reading");
    }

    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.size !== after.size
      || after.size !== totalBytes
    ) {
      throw new Error("bounded UTF-8 input changed while being read");
    }
    return fatalUtf8Decoder.decode(Buffer.concat(chunks, totalBytes));
  } finally {
    closeSync(descriptor);
  }
}

/**
 * Compare exact base/head package-lock documents against one explicit provenance policy.
 * A changed lockfile passes only when every changed `packages` key is declared exactly,
 * each declared package binds the canonical SHA-256 of its exact before/after objects,
 * the policy is bound to the current pull-request base SHA, and no top-level lock metadata moves.
 */
export function evaluateLockfileChange({ baseLock, headLock, policy, expectedBaseSha }) {
  const failures = [];
  const basePackages = isRecord(baseLock) && isRecord(baseLock.packages) ? baseLock.packages : undefined;
  const headPackages = isRecord(headLock) && isRecord(headLock.packages) ? headLock.packages : undefined;
  if (!basePackages || !headPackages) {
    return {
      passed: false,
      changedPackages: [],
      failures: ["base and head package-lock documents must be objects with a packages map"],
    };
  }

  let packageKeys;
  let changedPackages;
  const packageDigestsByPath = new Map();
  try {
    packageKeys = [...new Set([...Object.keys(basePackages), ...Object.keys(headPackages)])].sort();
    for (const packagePath of packageKeys) {
      packageDigestsByPath.set(packagePath, {
        beforeSha256: packageObjectDigest(basePackages[packagePath]),
        afterSha256: packageObjectDigest(headPackages[packagePath]),
      });
    }
    changedPackages = packageKeys.filter((packagePath) => {
      const digests = packageDigestsByPath.get(packagePath);
      return digests.beforeSha256 !== digests.afterSha256;
    });
  } catch {
    return {
      passed: false,
      changedPackages: [],
      failures: ["base and head package-lock package entries must contain canonical JSON values"],
    };
  }

  let topLevelChanged;
  try {
    const baseMetadata = Object.fromEntries(Object.entries(baseLock).filter(([key]) => key !== "packages"));
    const headMetadata = Object.fromEntries(Object.entries(headLock).filter(([key]) => key !== "packages"));
    topLevelChanged = comparisonToken(baseMetadata) !== comparisonToken(headMetadata);
  } catch {
    return {
      passed: false,
      changedPackages,
      failures: ["base and head package-lock metadata must contain canonical JSON values"],
    };
  }
  if (topLevelChanged) {
    failures.push("package-lock top-level metadata changed outside the packages map");
  }

  if (changedPackages.length === 0) {
    return { passed: failures.length === 0, changedPackages, failures };
  }

  if (!isRecord(policy)) {
    failures.push("changed package-lock.json requires a reviewed lockfile change policy");
    return { passed: false, changedPackages, failures };
  }

  if (policy.schemaVersion !== 2) {
    failures.push("lockfile change policy schemaVersion must equal 2");
  }
  if (
    typeof expectedBaseSha !== "string"
    || !fullShaPattern.test(expectedBaseSha)
    || policy.baseSha !== expectedBaseSha
  ) {
    failures.push("lockfile change policy baseSha must equal the exact pull-request base SHA");
  }

  const targetPackages = Array.isArray(policy.targetPackages) ? policy.targetPackages : [];
  const targetSet = new Set(targetPackages);
  if (
    targetPackages.length === 0
    || targetPackages.length > MAX_TARGET_PACKAGES
    || targetSet.size !== targetPackages.length
    || targetPackages.some((value) => !canonicalPackagePath(value))
  ) {
    failures.push("lockfile change policy targetPackages must be a bounded unique canonical package-key list");
  }
  if (
    targetPackages.length !== changedPackages.length
    || changedPackages.some((key) => !targetSet.has(key))
  ) {
    failures.push("policy targetPackages must exactly match every changed package-lock packages key");
  }

  const packageDigests = isRecord(policy.packageDigests) ? policy.packageDigests : undefined;
  const digestKeys = packageDigests ? Object.keys(packageDigests).sort() : [];
  const sortedTargets = [...targetPackages].sort();
  const digestKeySetMatches =
    digestKeys.length === sortedTargets.length
    && digestKeys.every((key, index) => key === sortedTargets[index]);
  let digestEvidenceValid = Boolean(packageDigests) && digestKeySetMatches;
  if (digestEvidenceValid) {
    for (const packagePath of sortedTargets) {
      const digestRecord = packageDigests[packagePath];
      const digestRecordKeys = isRecord(digestRecord) ? Object.keys(digestRecord).sort() : [];
      if (
        !isRecord(digestRecord)
        || digestRecordKeys.length !== 2
        || digestRecordKeys[0] !== "afterSha256"
        || digestRecordKeys[1] !== "beforeSha256"
        || typeof digestRecord.beforeSha256 !== "string"
        || typeof digestRecord.afterSha256 !== "string"
        || !sha256Pattern.test(digestRecord.beforeSha256)
        || !sha256Pattern.test(digestRecord.afterSha256)
      ) {
        digestEvidenceValid = false;
        break;
      }
      const expectedDigests = packageDigestsByPath.get(packagePath) ?? {
        beforeSha256: packageObjectDigest(undefined),
        afterSha256: packageObjectDigest(undefined),
      };
      if (
        digestRecord.beforeSha256 !== expectedDigests.beforeSha256
        || digestRecord.afterSha256 !== expectedDigests.afterSha256
      ) {
        digestEvidenceValid = false;
        break;
      }
    }
  }
  if (!digestEvidenceValid) {
    failures.push("lockfile change policy must bind exact before and after package object digests");
  }

  if (
    typeof policy.justification !== "string"
    || policy.justification.trim().length === 0
    || policy.justification.length > MAX_JUSTIFICATION_CHARS
  ) {
    failures.push("lockfile change policy requires a bounded non-empty justification");
  }

  const sources = Array.isArray(policy.sources) ? policy.sources : [];
  if (sources.length === 0 || sources.length > MAX_SOURCES || sources.some((value) => !validSourceUrl(value))) {
    failures.push("lockfile change policy requires bounded HTTPS source evidence");
  }

  return { passed: failures.length === 0, changedPackages, failures };
}

/**
 * Read the exact CI inputs and evaluate the lockfile change-control gate.
 * `readText` is injectable so tests can verify the control without filesystem races or subprocesses.
 */
export function runLockfileChangeControl({
  environment = process.env,
  readText = readBoundedUtf8,
} = {}) {
  const basePath = environment.NOEMA_LOCKFILE_BASE_PATH;
  const expectedBaseSha = environment.NOEMA_LOCKFILE_BASE_SHA;
  if (
    typeof basePath !== "string"
    || basePath.length === 0
    || typeof expectedBaseSha !== "string"
    || !fullShaPattern.test(expectedBaseSha)
  ) {
    return {
      passed: false,
      changedPackages: [],
      failures: ["exact pull-request base lock path and SHA are required"],
    };
  }

  try {
    const baseLock = JSON.parse(readText(basePath, MAX_LOCKFILE_BYTES));
    const headLock = JSON.parse(readText("package-lock.json", MAX_LOCKFILE_BYTES));
    let policy;
    try {
      policy = JSON.parse(readText(".github/lockfile-change-policy.json", MAX_POLICY_BYTES));
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        policy = undefined;
      } else {
        throw error;
      }
    }
    return evaluateLockfileChange({ baseLock, headLock, policy, expectedBaseSha });
  } catch {
    return {
      passed: false,
      changedPackages: [],
      failures: ["lockfile change-control inputs must be bounded valid UTF-8 JSON"],
    };
  }
}
