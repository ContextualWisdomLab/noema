import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, normalize, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readStableRegularFile } from "./lib/stable-file-evidence.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const DEFAULT_LOCK_PATH = "package-lock.json";
const DEFAULT_OUTPUT_PATH = "artifacts/release/dependency-licenses.json";
const MAXIMUM_LOCKFILE_BYTES = 4 * 1024 * 1024;
const MAXIMUM_NESTED_RESOLVED_DEPTH = 8;
const fatalUtf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const canonicalPackagePathPattern = /^(?:node_modules\/(?:@[^/]+\/(?!\.{1,2}(?:\/|$))[^/]+|(?!\.{1,2}(?:\/|$)|@)[^/]+))(?:\/node_modules\/(?:@[^/]+\/(?!\.{1,2}(?:\/|$))[^/]+|(?!\.{1,2}(?:\/|$)|@)[^/]+))*$/;
const forbiddenIdentityCodePointPattern = /[\p{Cc}\p{Cf}\p{Cs}]/u;
const forbiddenPackagePathCharacterPattern = /[\\\s]/u;
const malformedPercentEscapePattern = /%(?![0-9A-Fa-f]{2})/;
const supportedSriIntegrityPattern = /^(?:sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2})(?: sha(?:1|256|384|512)-[A-Za-z0-9+/]+={0,2})*$/;
const sensitiveResolvedQueryKeyPattern = /(?:^|[^a-z0-9])(?:auth|authorization|token|secret|password|passwd|key|sig|signature|credential)(?:$|[^a-z0-9])/i;
const githubCredentialTokenPattern = /(^|[^a-z0-9])(github_pat_|gh[pousr]_)/i;
const npmCredentialTokenPattern = /(^|[^a-z0-9])npm_[a-z0-9]{36}([^a-z0-9]|$)/i;
const compactSensitiveResolvedQueryKeys = new Set([
  "apikey",
  "accesskey",
  "accesskeyid",
  "clientsecret",
  "sessiontoken",
  "authtoken",
  "accesstoken",
  "refreshtoken",
  "privatekey",
  "secretkey",
  "secretaccesskey",
  "signingkey",
]);

function hasStrongCredentialToken(value) {
  return githubCredentialTokenPattern.test(value) || npmCredentialTokenPattern.test(value);
}

function nonEmptyString(value, packagePath, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${packagePath}: non-empty ${field} required`);
  }
  if (value !== value.trim() || forbiddenIdentityCodePointPattern.test(value)) {
    throw new Error(`${packagePath}: canonical ${field} required`);
  }
  return value;
}

function canonicalIntegrity(value, packagePath) {
  const integrity = nonEmptyString(value, packagePath, "integrity");
  if (!supportedSriIntegrityPattern.test(integrity)) {
    throw new Error(`${packagePath}: supported SRI integrity required`);
  }
  return integrity;
}

function decodePercentTriplets(value) {
  return value.replace(
    /%([0-9A-Fa-f]{2})/g,
    (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function isSensitiveResolvedParameterKey(key) {
  let candidate = key;
  while (true) {
    const separatedCamelCase = candidate.replace(/([a-z0-9])([A-Z])/g, "$1_$2");
    const normalizedKey = separatedCamelCase.toLowerCase();
    if (
      sensitiveResolvedQueryKeyPattern.test(normalizedKey)
      || compactSensitiveResolvedQueryKeys.has(normalizedKey.replace(/[_-]/g, ""))
    ) {
      return true;
    }
    const decodedCandidate = decodePercentTriplets(candidate);
    if (decodedCandidate === candidate) return false;
    candidate = decodedCandidate;
  }
}

function hasCredentialBearingUrlAuthority(parsed) {
  const protocol = parsed.protocol.toLowerCase();
  const isSshLike = protocol === "ssh:" || protocol.endsWith("+ssh:");
  const conventionalGitSshUser = isSshLike && parsed.username === "git";
  return (
    parsed.password !== ""
    || (parsed.username !== "" && !conventionalGitSshUser)
  );
}

function hasCredentialBearingUrlPath(parsed) {
  let candidate = parsed.pathname;
  while (true) {
    if (hasStrongCredentialToken(candidate)) return true;
    const decodedCandidate = decodePercentTriplets(candidate);
    if (decodedCandidate === candidate) return false;
    candidate = decodedCandidate;
  }
}

function hasSensitiveNestedResolvedParameters(value) {
  const pending = [{ value, depth: 0 }];

  while (pending.length > 0) {
    const { value: candidate, depth } = pending.pop();
    if (depth > MAXIMUM_NESTED_RESOLVED_DEPTH) return true;
    if (hasStrongCredentialToken(candidate)) return true;

    let nestedUrl;
    try {
      nestedUrl = new URL(candidate);
    } catch {
      nestedUrl = null;
    }

    if (nestedUrl) {
      if (
        hasCredentialBearingUrlAuthority(nestedUrl)
        || hasCredentialBearingUrlPath(nestedUrl)
      ) return true;
      for (const [nestedKey, nestedValue] of nestedUrl.searchParams) {
        if (isSensitiveResolvedParameterKey(nestedKey)) return true;
        pending.push({ value: nestedValue, depth: depth + 1 });
      }
      const fragment = nestedUrl.hash.startsWith("#")
        ? nestedUrl.hash.slice(1)
        : nestedUrl.hash;
      if (fragment !== "") {
        pending.push({ value: fragment, depth: depth + 1 });
      }
    } else {
      for (const [nestedKey, nestedValue] of new URLSearchParams(candidate)) {
        if (isSensitiveResolvedParameterKey(nestedKey)) return true;
        pending.push({ value: nestedValue, depth: depth + 1 });
      }

      for (let index = 0; index < candidate.length; index += 1) {
        if (candidate[index] !== "?" && candidate[index] !== "#") continue;
        for (const [nestedKey, nestedValue] of new URLSearchParams(candidate.slice(index + 1))) {
          if (isSensitiveResolvedParameterKey(nestedKey)) return true;
          pending.push({ value: nestedValue, depth: depth + 1 });
        }
      }
    }

    const decodedCandidate = decodePercentTriplets(candidate);
    if (decodedCandidate !== candidate) {
      pending.push({ value: decodedCandidate, depth: depth + 1 });
    }
  }

  return false;
}

function assertCredentialFreeParameters(parameters, packagePath) {
  for (const [key, value] of parameters) {
    if (
      isSensitiveResolvedParameterKey(key)
      || hasSensitiveNestedResolvedParameters(value)
    ) {
      throw new Error(`${packagePath}: credential-free resolved required`);
    }
  }
}

function assertCredentialFreeFragmentValue(fragment, packagePath) {
  if (hasStrongCredentialToken(fragment)) {
    throw new Error(`${packagePath}: credential-free resolved required`);
  }
  assertCredentialFreeParameters(new URLSearchParams(fragment), packagePath);
  const nestedQueryIndex = fragment.indexOf("?");
  if (nestedQueryIndex >= 0) {
    assertCredentialFreeParameters(
      new URLSearchParams(fragment.slice(nestedQueryIndex + 1)),
      packagePath,
    );
  }
}

function assertCredentialFreeFragment(hash, packagePath) {
  let fragment = hash.startsWith("#") ? hash.slice(1) : hash;
  while (true) {
    assertCredentialFreeFragmentValue(fragment, packagePath);
    const decodedFragment = decodePercentTriplets(fragment);
    if (decodedFragment === fragment) return;
    fragment = decodedFragment;
  }
}

function assertCanonicalPercentEscapes(value, packagePath) {
  if (malformedPercentEscapePattern.test(value)) {
    throw new Error(`${packagePath}: canonical resolved artifact URI required`);
  }
}

function credentialFreeResolved(value, packagePath) {
  const resolved = nonEmptyString(value, packagePath, "resolved");
  assertCanonicalPercentEscapes(resolved, packagePath);
  let parsed;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error(`${packagePath}: canonical resolved artifact URI required`);
  }
  if (parsed.href !== resolved) {
    throw new Error(`${packagePath}: canonical resolved artifact URI required`);
  }
  if (
    hasCredentialBearingUrlAuthority(parsed)
    || hasCredentialBearingUrlPath(parsed)
  ) {
    throw new Error(`${packagePath}: credential-free resolved required`);
  }
  assertCredentialFreeParameters(parsed.searchParams, packagePath);
  assertCredentialFreeFragment(parsed.hash, packagePath);
  return resolved;
}

function optionalBoolean(value, packagePath, field) {
  if (value === undefined) return false;
  if (typeof value !== "boolean") {
    throw new Error(`${packagePath}: boolean ${field} required when present`);
  }
  return value;
}

function optionalCanonicalStringArray(value, packagePath, field) {
  if (value === undefined) return undefined;
  if (
    !Array.isArray(value)
    || value.length === 0
    || value.some(
      (entry) =>
        typeof entry !== "string"
        || entry.trim() === ""
        || entry !== entry.trim()
        || forbiddenIdentityCodePointPattern.test(entry),
    )
    || new Set(value).size !== value.length
  ) {
    throw new Error(`${packagePath}: canonical ${field} array required when present`);
  }
  return [...value];
}

function packageNameFromPath(packagePath) {
  if (!packagePath.startsWith("node_modules/")) {
    throw new Error(`${packagePath}: canonical node_modules package path required`);
  }
  if (
    forbiddenIdentityCodePointPattern.test(packagePath)
    || forbiddenPackagePathCharacterPattern.test(packagePath)
    || !canonicalPackagePathPattern.test(packagePath)
  ) {
    throw new Error(`${packagePath}: canonical package name required`);
  }
  const nestedMarker = "/node_modules/";
  const nestedIndex = packagePath.lastIndexOf(nestedMarker);
  return nestedIndex >= 0
    ? packagePath.slice(nestedIndex + nestedMarker.length)
    : packagePath.slice("node_modules/".length);
}

function parseLockfile(lockBytes) {
  let lock;
  try {
    lock = JSON.parse(lockBytes);
  } catch {
    throw new Error("package-lock.json must be valid JSON");
  }
  if (hasDuplicateJsonObjectKeys(lockBytes)) {
    throw new Error("package-lock.json must not contain duplicate object keys");
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

function assertCanonicalEvidencePath(path, label) {
  if (typeof path !== "string" || path.length === 0 || normalize(path) !== path) {
    throw new Error(`dependency license inventory canonical ${label} path required`);
  }
}

function assertPathParents(path, label) {
  let parentPath = dirname(resolve(path));
  while (true) {
    if (existsSync(parentPath) && lstatSync(parentPath).isSymbolicLink()) {
      throw new Error(
        `dependency license inventory ${label} parent must not be a symlink: ${parentPath}`,
      );
    }
    const nextParent = dirname(parentPath);
    if (nextParent === parentPath) return;
    parentPath = nextParent;
  }
}

function readEvidenceFile(inputPath) {
  assertCanonicalEvidencePath(inputPath, "input");
  assertPathParents(inputPath, "input");
  const bytes = readStableRegularFile(
    inputPath,
    "dependency license inventory input",
    MAXIMUM_LOCKFILE_BYTES,
  );
  assertPathParents(inputPath, "input");
  try {
    return fatalUtf8Decoder.decode(bytes);
  } catch {
    throw new Error("package-lock.json must be valid UTF-8");
  }
}

function removeSafeExistingOutput(outputPath) {
  if (!existsSync(outputPath)) return;
  const metadata = lstatSync(outputPath);
  if (metadata.isSymbolicLink()) {
    throw new Error(`dependency license inventory output must not be a symlink: ${outputPath}`);
  }
  if (metadata.nlink !== 1) {
    throw new Error(`dependency license inventory output must have exactly one link: ${outputPath}`);
  }
  unlinkSync(outputPath);
}

function writeEvidenceFile(outputPath, content) {
  removeSafeExistingOutput(outputPath);
  const descriptor = openSync(
    outputPath,
    constants.O_WRONLY
      | constants.O_CREAT
      | constants.O_EXCL
      | constants.O_NOFOLLOW,
    0o600,
  );
  try {
    writeFileSync(descriptor, content, "utf8");
  } finally {
    closeSync(descriptor);
  }
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
  if (
    sourcePath !== sourcePath.trim()
    || forbiddenIdentityCodePointPattern.test(sourcePath)
  ) {
    throw new TypeError("package-lock.json source path must be canonical");
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
      const devOptional = optionalBoolean(entry.devOptional, packagePath, "devOptional");
      const inBundle = optionalBoolean(entry.inBundle, packagePath, "inBundle");
      const hasInstallScript = optionalBoolean(
        entry.hasInstallScript,
        packagePath,
        "hasInstallScript",
      );
      const cpu = optionalCanonicalStringArray(entry.cpu, packagePath, "cpu");
      const os = optionalCanonicalStringArray(entry.os, packagePath, "os");
      return {
        package_path: packagePath,
        name: packageNameFromPath(packagePath),
        version: nonEmptyString(entry.version, packagePath, "version"),
        license: nonEmptyString(entry.license, packagePath, "license"),
        resolved: credentialFreeResolved(entry.resolved, packagePath),
        integrity: canonicalIntegrity(entry.integrity, packagePath),
        dev: optionalBoolean(entry.dev, packagePath, "dev"),
        optional: optionalBoolean(entry.optional, packagePath, "optional"),
        ...(entry.devOptional === undefined ? {} : { dev_optional: devOptional }),
        ...(entry.inBundle === undefined ? {} : { in_bundle: inBundle }),
        ...(entry.hasInstallScript === undefined
          ? {}
          : { has_install_script: hasInstallScript }),
        ...(cpu === undefined ? {} : { cpu }),
        ...(os === undefined ? {} : { os }),
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
  const lockBytes = readEvidenceFile(lockPath);
  const inventory = buildDependencyLicenseInventory(lockBytes, { sourcePath: lockPath });
  assertCanonicalEvidencePath(outputPath, "output");
  assertPathParents(outputPath, "output");
  mkdirSync(dirname(outputPath), { recursive: true });
  assertPathParents(outputPath, "output");
  writeEvidenceFile(outputPath, `${JSON.stringify(inventory, null, 2)}\n`);
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
