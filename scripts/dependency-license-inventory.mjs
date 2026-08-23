import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const DEFAULT_LOCK_PATH = "package-lock.json";
const DEFAULT_OUTPUT_PATH = "artifacts/release/dependency-licenses.json";

function nonEmptyString(value, packagePath, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${packagePath}: non-empty ${field} required`);
  }
  return value;
}

function packageNameFromPath(packagePath) {
  const marker = "node_modules/";
  const index = packagePath.lastIndexOf(marker);
  if (index < 0) {
    throw new Error(`${packagePath}: node_modules package path required`);
  }
  const name = packagePath.slice(index + marker.length);
  if (!name || name.includes("/node_modules/")) {
    throw new Error(`${packagePath}: canonical package name required`);
  }
  return name;
}

function parseLockfile(lockBytes) {
  if (hasDuplicateJsonObjectKeys(lockBytes)) {
    throw new Error("package-lock.json must not contain duplicate object keys");
  }
  let lock;
  try {
    lock = JSON.parse(lockBytes);
  } catch {
    throw new Error("package-lock.json must be valid JSON");
  }
  if (!lock || typeof lock !== "object" || Array.isArray(lock)) {
    throw new Error("package-lock.json object required");
  }
  if (lock.lockfileVersion !== 3) {
    throw new Error("package-lock.json lockfileVersion 3 required");
  }
  if (!lock.packages || typeof lock.packages !== "object" || Array.isArray(lock.packages)) {
    throw new Error("package-lock.json packages object required");
  }
  return lock;
}

export function buildDependencyLicenseInventory(lockBytes) {
  if (typeof lockBytes !== "string") {
    throw new TypeError("package-lock.json bytes must be a string");
  }
  const lock = parseLockfile(lockBytes);
  const packages = Object.entries(lock.packages)
    .filter(([packagePath]) => packagePath !== "")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([packagePath, rawEntry]) => {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        throw new Error(`${packagePath}: package object required`);
      }
      const entry = rawEntry;
      return {
        package_path: packagePath,
        name: packageNameFromPath(packagePath),
        version: nonEmptyString(entry.version, packagePath, "version"),
        license: nonEmptyString(entry.license, packagePath, "license"),
        resolved: nonEmptyString(entry.resolved, packagePath, "resolved"),
        integrity: nonEmptyString(entry.integrity, packagePath, "integrity"),
        dev: entry.dev === true,
        optional: entry.optional === true,
      };
    });

  return {
    schema_version: 1,
    source: {
      path: DEFAULT_LOCK_PATH,
      sha256: createHash("sha256").update(lockBytes).digest("hex"),
      lockfile_version: 3,
    },
    packages,
  };
}

export function generateDependencyLicenseInventory({
  lockPath = DEFAULT_LOCK_PATH,
  outputPath = DEFAULT_OUTPUT_PATH,
} = {}) {
  const lockBytes = readFileSync(lockPath, "utf8");
  const inventory = buildDependencyLicenseInventory(lockBytes);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return inventory;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const inventory = generateDependencyLicenseInventory({
      lockPath: process.env.NOEMA_DEPENDENCY_LICENSE_LOCK_PATH || DEFAULT_LOCK_PATH,
      outputPath:
        process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH || DEFAULT_OUTPUT_PATH,
    });
    console.log(
      `dependency license inventory: ${inventory.packages.length} packages -> ${
        process.env.NOEMA_DEPENDENCY_LICENSE_OUTPUT_PATH || DEFAULT_OUTPUT_PATH
      }`,
    );
  } catch (error) {
    console.error(
      `dependency license inventory failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
  }
}