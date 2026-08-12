#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const EXPECTED_SBOM_NAME = "noema.cdx.json";
const MAX_SBOM_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const shaPattern = /^[0-9a-f]{40}$/i;
const versionPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(message);
}

function parseArguments(argv) {
  const accepted = new Set(["--source", "--sbom", "--output-dir"]);
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!accepted.has(flag)) {
      fail(`unknown argument ${flag || "<missing>"}`);
    }
    if (!value || value.startsWith("--")) {
      fail(`argument ${flag} requires a value`);
    }
    if (values.has(flag)) {
      fail(`argument ${flag} may be supplied only once`);
    }
    values.set(flag, value);
  }
  for (const flag of accepted) {
    if (!values.has(flag)) {
      fail(`required argument ${flag} is missing`);
    }
  }
  return {
    sourcePath: resolve(values.get("--source")),
    sbomPath: resolve(values.get("--sbom")),
    outputDir: resolve(values.get("--output-dir")),
  };
}

function requireRegularFile(path, label, maxBytes) {
  if (!existsSync(path)) {
    fail(`${label} does not exist: ${path}`);
  }
  const linkStatus = lstatSync(path);
  if (linkStatus.isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
  const status = statSync(path);
  if (!status.isFile()) {
    fail(`${label} must be a regular file`);
  }
  if (status.size <= 0) {
    fail(`${label} must not be empty`);
  }
  if (status.size > maxBytes) {
    fail(`${label} exceeds the ${maxBytes}-byte limit`);
  }
  return status;
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function validateReleaseIdentity() {
  const repository = requireString(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const commitSha = requireString(
    process.env.NOEMA_RELEASE_COMMIT_SHA || process.env.GITHUB_SHA,
    "release commit SHA",
  );
  const ref = requireString(
    process.env.NOEMA_RELEASE_REF || process.env.GITHUB_REF,
    "release ref",
  );
  const version = requireString(process.env.NOEMA_RELEASE_VERSION, "NOEMA_RELEASE_VERSION");
  const generatedAt = requireString(
    process.env.NOEMA_RELEASE_GENERATED_AT || new Date().toISOString(),
    "NOEMA_RELEASE_GENERATED_AT",
  );

  if (repository !== EXPECTED_REPOSITORY) {
    fail(`release repository must be ${EXPECTED_REPOSITORY}, received ${repository}`);
  }
  if (!shaPattern.test(commitSha)) {
    fail("release commit SHA must be a full 40-character hexadecimal SHA");
  }
  if (!versionPattern.test(version)) {
    fail(`release version is not valid SemVer: ${version}`);
  }
  if (ref !== `refs/tags/v${version}`) {
    fail(`release ref must be refs/tags/v${version}, received ${ref}`);
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    fail("NOEMA_RELEASE_GENERATED_AT must be an ISO-compatible timestamp");
  }

  return { repository, commitSha, ref, version, generatedAt };
}

function validateSbom(sbom, version) {
  if (!sbom || typeof sbom !== "object" || Array.isArray(sbom)) {
    fail("SBOM must be a JSON object");
  }
  if (sbom.bomFormat !== "CycloneDX") {
    fail(`SBOM bomFormat must be CycloneDX, received ${String(sbom.bomFormat)}`);
  }
  if (sbom.specVersion !== "1.5") {
    fail(`SBOM specVersion must be 1.5, received ${String(sbom.specVersion)}`);
  }
  if (sbom.version !== 1) {
    fail(`SBOM document version must be 1, received ${String(sbom.version)}`);
  }
  if (typeof sbom.serialNumber !== "string" || !sbom.serialNumber.startsWith("urn:uuid:")) {
    fail("SBOM serialNumber must be a urn:uuid value");
  }

  const root = sbom.metadata?.component;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    fail("SBOM metadata.component is required");
  }
  if (root.type !== "application") {
    fail(`SBOM root component type must be application, received ${String(root.type)}`);
  }
  if (root.name !== "noema") {
    fail(`SBOM root component name must be noema, received ${String(root.name)}`);
  }
  if (root.version !== version) {
    fail(`SBOM root component version must be ${version}, received ${String(root.version)}`);
  }
  if (typeof root["bom-ref"] !== "string" || root["bom-ref"].trim().length === 0) {
    fail("SBOM root component bom-ref is required");
  }
  if (!Array.isArray(sbom.components)) {
    fail("SBOM components must be an array");
  }
  if (!Array.isArray(sbom.dependencies)) {
    fail("SBOM dependencies must be an array");
  }
  if (!sbom.dependencies.some((dependency) => dependency?.ref === root["bom-ref"])) {
    fail("SBOM dependencies must include the root component bom-ref");
  }

  return {
    bomFormat: sbom.bomFormat,
    specVersion: sbom.specVersion,
    serialNumber: sbom.serialNumber,
    componentCount: sbom.components.length,
    dependencyCount: sbom.dependencies.length,
    rootComponent: {
      type: root.type,
      name: root.name,
      version: root.version,
    },
  };
}

function requireSafeOutputPath(path, label) {
  if (existsSync(path) && lstatSync(path).isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
}

function run() {
  const { sourcePath, sbomPath, outputDir } = parseArguments(process.argv.slice(2));
  const identity = validateReleaseIdentity();
  const expectedSourceName = `noema-${identity.commitSha}.tar.gz`;
  if (basename(sourcePath) !== expectedSourceName) {
    fail(`source archive filename must be ${expectedSourceName}`);
  }
  if (basename(sbomPath) !== EXPECTED_SBOM_NAME) {
    fail(`SBOM filename must be ${EXPECTED_SBOM_NAME}`);
  }
  if (sourcePath === sbomPath) {
    fail("source archive and SBOM paths must be different files");
  }

  const sourceStatus = requireRegularFile(sourcePath, "source archive", MAX_SOURCE_BYTES);
  const sbomStatus = requireRegularFile(sbomPath, "SBOM", MAX_SBOM_BYTES);
  let sbomText;
  try {
    sbomText = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(sbomPath));
  } catch (error) {
    fail(`SBOM is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let sbom;
  try {
    sbom = JSON.parse(sbomText);
  } catch (error) {
    fail(`SBOM is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  const sbomSummary = validateSbom(sbom, identity.version);

  if (existsSync(outputDir)) {
    if (lstatSync(outputDir).isSymbolicLink() || !statSync(outputDir).isDirectory()) {
      fail("output directory must be a real directory, not a symlink or file");
    }
  } else {
    mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  }

  const manifestPath = resolve(outputDir, "release-evidence.json");
  const checksumsPath = resolve(outputDir, "SHA256SUMS");
  requireSafeOutputPath(manifestPath, "release evidence manifest");
  requireSafeOutputPath(checksumsPath, "checksum manifest");

  const sourceDigest = sha256(sourcePath);
  const sbomDigest = sha256(sbomPath);
  const manifest = {
    schemaVersion: 1,
    generatedAt: identity.generatedAt,
    source: {
      repository: identity.repository,
      commitSha: identity.commitSha,
      ref: identity.ref,
      version: identity.version,
    },
    subject: {
      name: basename(sourcePath),
      sha256: sourceDigest,
      bytes: sourceStatus.size,
      mediaType: "application/gzip",
    },
    sbom: {
      name: basename(sbomPath),
      sha256: sbomDigest,
      bytes: sbomStatus.size,
      ...sbomSummary,
    },
  };

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
  const manifestDigest = sha256(manifestPath);
  const checksums = [
    `${sourceDigest}  ${basename(sourcePath)}`,
    `${sbomDigest}  ${basename(sbomPath)}`,
    `${manifestDigest}  ${basename(manifestPath)}`,
  ].join("\n");
  writeFileSync(checksumsPath, `${checksums}\n`, { encoding: "utf8", mode: 0o644 });

  console.log(
    `release-evidence: PASS repository=${identity.repository} version=${identity.version} head=${identity.commitSha}`,
  );
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`release-evidence: FAIL: ${message.slice(0, 1000)}`);
  process.exitCode = 1;
}
