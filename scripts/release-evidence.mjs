#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  statSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import { assertAcquisitionPrivatePathParents } from "./lib/acquisition-private-output.mjs";
import { requireCanonicalReleaseBomRef } from "./lib/release-sbom-authority.mjs";
import { readStableRegularFile } from "./lib/stable-file-evidence.mjs";
import {
  hasDuplicateJsonObjectKeys,
  writeAtomically,
} from "./normalize-commercial-readiness-evidence.mjs";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const EXPECTED_SBOM_NAME = "noema.cdx.json";
const MAX_SBOM_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_BYTES = 512 * 1024 * 1024;
const MAX_SBOM_NESTING_DEPTH = 128;
const shaPattern = /^[0-9a-f]{40}$/;
const versionPattern = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|[0-9A-Za-z-]*[A-Za-z-][0-9A-Za-z-]*))*))?$/;
const canonicalUtcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const cycloneDxSerialNumberPattern = /^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value;
}

function readStableBytes(path, label, maximumBytes) {
  try {
    return readStableRegularFile(path, label, maximumBytes);
  } catch (error) {
    fail(`${label} could not be read safely: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateReleaseIdentity() {
  const repository = requireString(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const commitShaSource = process.env.NOEMA_RELEASE_COMMIT_SHA || process.env.GITHUB_SHA;
  const commitSha = requireString(
    commitShaSource,
    "release commit SHA",
  );
  const ref = requireString(
    process.env.NOEMA_RELEASE_REF || process.env.GITHUB_REF,
    "release ref",
  );
  const version = requireString(process.env.NOEMA_RELEASE_VERSION, "NOEMA_RELEASE_VERSION");
  const generatedAtSource = process.env.NOEMA_RELEASE_GENERATED_AT || new Date().toISOString();
  const generatedAt = requireString(
    generatedAtSource,
    "NOEMA_RELEASE_GENERATED_AT",
  );

  if (repository !== EXPECTED_REPOSITORY) {
    fail(`release repository must be ${EXPECTED_REPOSITORY}, received ${repository}`);
  }
  if (commitSha !== commitShaSource || !shaPattern.test(commitSha)) {
    fail("release commit SHA must be a canonical 40-character lowercase hexadecimal SHA");
  }
  if (!versionPattern.test(version)) {
    fail(`release version is not valid SemVer: ${version}`);
  }
  if (ref !== `refs/tags/v${version}`) {
    fail(`release ref must be refs/tags/v${version}, received ${ref}`);
  }
  const generatedAtMilliseconds = Date.parse(generatedAt);
  if (
    generatedAt !== generatedAtSource
    || !canonicalUtcTimestampPattern.test(generatedAt)
    || Number.isNaN(generatedAtMilliseconds)
    || new Date(generatedAtMilliseconds).toISOString() !== generatedAt
  ) {
    fail("NOEMA_RELEASE_GENERATED_AT must be a canonical UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)");
  }
  if (generatedAtMilliseconds > Date.now()) {
    fail("NOEMA_RELEASE_GENERATED_AT cannot be in the future");
  }

  return { repository, commitSha, ref, version, generatedAt };
}

function validateUniqueBomRefs(value) {
  const seen = new Set();

  function visit(node, depth = 0) {
    if (depth > MAX_SBOM_NESTING_DEPTH) {
      fail("SBOM nesting depth exceeds supported maximum");
    }
    if (!node || typeof node !== "object") {
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) {
        visit(item, depth + 1);
      }
      return;
    }

    if (Object.prototype.hasOwnProperty.call(node, "bom-ref")) {
      const bomRef = requireCanonicalReleaseBomRef(node["bom-ref"], "SBOM bom-ref");
      if (seen.has(bomRef)) {
        fail("SBOM bom-ref must be unique within the BOM");
      }
      seen.add(bomRef);
    }

    for (const child of Object.values(node)) {
      visit(child, depth + 1);
    }
  }

  visit(value);
  return seen;
}

function collectComponentBomRefs(components) {
  const refs = [];
  const pending = [...components];
  while (pending.length > 0) {
    const component = pending.pop();
    refs.push(component?.["bom-ref"]);
    const nestedComponents = Array.isArray(component?.components) ? component.components : [];
    pending.push(...nestedComponents);
  }
  return refs;
}

function requireDeclaredBomRef(value, label, bomRefs) {
  const bomRef = requireCanonicalReleaseBomRef(value, label);
  if (!bomRefs.has(bomRef)) {
    fail(`${label} must reference a declared bom-ref identity`);
  }
  return bomRef;
}

function validateDependencyGraph(dependencies, bomRefs, requiredDependencyRefs) {
  const seenDependencyRefs = new Set();

  for (const dependency of dependencies) {
    if (!dependency || typeof dependency !== "object" || Array.isArray(dependency)) {
      fail("SBOM dependency entries must be objects");
    }
    const dependencyRef = requireDeclaredBomRef(
      dependency.ref,
      "SBOM dependency ref",
      bomRefs,
    );
    if (seenDependencyRefs.has(dependencyRef)) {
      fail("SBOM dependency ref must be unique");
    }
    seenDependencyRefs.add(dependencyRef);

    if (dependency.dependsOn === undefined) {
      continue;
    }
    if (!Array.isArray(dependency.dependsOn)) {
      fail("SBOM dependency dependsOn must be an array when present");
    }
    const seenTargets = new Set();
    for (const target of dependency.dependsOn) {
      const targetRef = requireDeclaredBomRef(
        target,
        "SBOM dependency dependsOn target",
        bomRefs,
      );
      if (seenTargets.has(targetRef)) {
        fail("SBOM dependency dependsOn target must be unique");
      }
      seenTargets.add(targetRef);
    }
  }

  for (const requiredRef of requiredDependencyRefs) {
    const declaredRef = requireDeclaredBomRef(
      requiredRef,
      "SBOM dependency graph component",
      bomRefs,
    );
    if (!seenDependencyRefs.has(declaredRef)) {
      fail("SBOM dependency graph must include every declared component bom-ref");
    }
  }
}

function validateSbom(sbom, version) {
  if (!sbom || typeof sbom !== "object" || Array.isArray(sbom)) {
    fail("SBOM must be a JSON object");
  }
  if (sbom.bomFormat !== "CycloneDX") {
    fail("SBOM bomFormat must be CycloneDX");
  }
  if (sbom.specVersion !== "1.5") {
    fail("SBOM specVersion must be 1.5");
  }
  if (sbom.version !== 1) {
    fail("SBOM document version must be 1");
  }
  if (typeof sbom.serialNumber !== "string" || !cycloneDxSerialNumberPattern.test(sbom.serialNumber)) {
    fail("SBOM serialNumber must be a canonical RFC 4122 urn:uuid value");
  }
  const bomRefs = validateUniqueBomRefs(sbom);

  const root = sbom.metadata?.component;
  if (!root || typeof root !== "object" || Array.isArray(root)) {
    fail("SBOM metadata.component is required");
  }
  if (root.type !== "application") {
    fail("SBOM root component type must be application");
  }
  if (root.name !== "noema") {
    fail("SBOM root component name must be noema");
  }
  if (root.version !== version) {
    fail(`SBOM root component version must match release version ${version}`);
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
  const requiredDependencyRefs = collectComponentBomRefs([root, ...sbom.components]);
  validateDependencyGraph(sbom.dependencies, bomRefs, requiredDependencyRefs);
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

  const sourceBytes = readStableBytes(sourcePath, "source archive", MAX_SOURCE_BYTES);
  const sbomBytes = readStableBytes(sbomPath, "SBOM", MAX_SBOM_BYTES);
  let sbomText;
  try {
    sbomText = new TextDecoder("utf-8", { fatal: true }).decode(sbomBytes);
  } catch (error) {
    fail(`SBOM is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  let sbom;
  try {
    if (hasDuplicateJsonObjectKeys(sbomText)) {
      fail("SBOM contains duplicate decoded JSON object keys");
    }
    sbom = JSON.parse(sbomText);
  } catch (error) {
    if (error instanceof Error && error.message === "SBOM contains duplicate decoded JSON object keys") {
      throw error;
    }
    fail("SBOM is not valid JSON");
  }
  const sbomSummary = validateSbom(sbom, identity.version);
  const manifestPath = resolve(outputDir, "release-evidence.json");
  const checksumsPath = resolve(outputDir, "SHA256SUMS");

  assertAcquisitionPrivatePathParents(manifestPath);
  assertAcquisitionPrivatePathParents(checksumsPath);
  if (existsSync(outputDir)) {
    if (lstatSync(outputDir).isSymbolicLink() || !statSync(outputDir).isDirectory()) {
      fail("output directory must be a real directory, not a symlink or file");
    }
  } else {
    mkdirSync(outputDir, { recursive: true, mode: 0o755 });
  }
  assertAcquisitionPrivatePathParents(manifestPath);
  assertAcquisitionPrivatePathParents(checksumsPath);

  const sourceDigest = sha256(sourceBytes);
  const sbomDigest = sha256(sbomBytes);
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
      bytes: sourceBytes.byteLength,
      mediaType: "application/gzip",
    },
    sbom: {
      name: basename(sbomPath),
      sha256: sbomDigest,
      bytes: sbomBytes.byteLength,
      ...sbomSummary,
    },
  };

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestDigest = sha256(Buffer.from(manifestText, "utf8"));
  writeAtomically(manifestPath, manifestText);
  const checksums = [
    `${sourceDigest}  ${basename(sourcePath)}`,
    `${sbomDigest}  ${basename(sbomPath)}`,
    `${manifestDigest}  ${basename(manifestPath)}`,
  ].join("\n");
  writeAtomically(checksumsPath, `${checksums}\n`);

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