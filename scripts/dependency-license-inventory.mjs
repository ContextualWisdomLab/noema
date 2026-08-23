import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
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
  if (!name) {
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

export function buildDependencyLicenseInventory(
  lockBytes,
  { sourcePath = DEFAULT_LOCK_PATH } = {},
) {
  if (typeof lockBytes !== "string") {
    throw new TypeError("package-lock.json bytes must be a string");
  }
  if (typeof sourcePath !== "string" || sourcePath.trim() === "") {
    throw new TypeError("package-lock.json source path must be a non-empty string");
  }
  const lock = parseLockfile(lockBytes);
  const packages = Object.keys(lock.packages)
    .filter((packagePath) => packagePath !== "")
    .sort()
    .map((packagePath) => {
      const rawEntry = lock.packages[packagePath];
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
      path: sourcePath,
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
  const inventory = buildDependencyLicenseInventory(lockBytes, { sourcePath: lockPath });
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  return inventory;
}

export function main(options = {}) {
  const lockPath = DEFAULT_LOCK_PATH;
  const outputPath = DEFAULT_OUTPUT_PATH;
  const generateInventory =
    options.generate_inventory ?? generateDependencyLicenseInventory;
  const writeOutput = options.write_output ?? ((value) => process.stdout.write(value));
  const inventory = generateInventory({ lockPath, outputPath });
  writeOutput(
    `dependency license inventory: ${inventory.packages.length} packages -> ${outputPath}\n`,
  );
  return inventory;
}

export function startCli(options = {}) {
  const execute = options.execute ?? main;
  const writeError = options.write_error ?? ((value) => process.stderr.write(value));
  const setExitCode = options.set_exit_code ?? ((code) => {
    process.exitCode = code;
  });
  try {
    return execute();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    writeError(`dependency license inventory failed: ${message}\n`);
    setExitCode(1);
    return undefined;
  }
}

export function runIfDirect(metaUrl, argv, execute) {
  if (!argv[1] || metaUrl !== pathToFileURL(resolve(argv[1])).href) return false;
  execute();
  return true;
}

runIfDirect(import.meta.url, process.argv, startCli);