#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const MAX_JSON_NESTING_DEPTH = 256;
const MAXIMUM_SIGNED_OPEN_FLAG = 0x7fff_ffff;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const CANONICAL_UTC_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const JSON_PRIMITIVE_PATTERN =
  /(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/y;
const defaultFileSystem = Object.freeze({
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
});

function fail(message) {
  throw new Error(message);
}

function fileFail(label, detail) {
  fail(`${label} ${detail}`);
}

function safeOpenFlag(value, { allowZero }) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value <= MAXIMUM_SIGNED_OPEN_FLAG
    && (allowZero || value !== 0);
}

function requireRegularMetadata(metadata, label, maximumBytes) {
  if (!metadata || typeof metadata !== "object" || typeof metadata.isFile !== "function") {
    fileFail(label, "metadata is unavailable");
  }
  if (typeof metadata.isSymbolicLink === "function" && metadata.isSymbolicLink()) {
    fileFail(label, "must not be a symbolic link");
  }
  if (!metadata.isFile()) {
    fileFail(label, "must be a regular file");
  }
  if (!Number.isSafeInteger(metadata.size) || metadata.size < 0) {
    fileFail(label, "has an invalid byte size");
  }
  if (metadata.size === 0) {
    fileFail(label, "must not be empty");
  }
  if (metadata.size > maximumBytes) {
    fileFail(label, `exceeds the ${maximumBytes}-byte ceiling`);
  }
  return metadata;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size;
}

function sameStableDescriptor(left, right) {
  return sameIdentity(left, right)
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}

/**
 * Read one bounded regular file through a no-follow descriptor and accept the
 * bytes only while descriptor state and pathname identity stay stable.
 */
function readStableRegularFile(
  path,
  label,
  maximumBytes,
  fileSystem = defaultFileSystem,
) {
  if (typeof path !== "string" || path.length === 0) {
    fileFail("stable file", "path must be a non-empty string");
  }
  if (typeof label !== "string" || label.length === 0) {
    fileFail("stable file", "label must be a non-empty string");
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    fileFail(label, "requires a positive safe byte ceiling");
  }

  const noFollow = fileSystem.constants?.O_NOFOLLOW;
  const readOnly = fileSystem.constants?.O_RDONLY;
  if (!safeOpenFlag(noFollow, { allowZero: false })) {
    fileFail(label, "requires a supported no-follow open flag");
  }
  if (!safeOpenFlag(readOnly, { allowZero: true })) {
    fileFail(label, "requires a supported read-only open flag");
  }

  const pathMetadata = requireRegularMetadata(
    fileSystem.lstatSync(path),
    label,
    maximumBytes,
  );
  const descriptor = fileSystem.openSync(path, readOnly | noFollow);
  try {
    const openedMetadata = requireRegularMetadata(
      fileSystem.fstatSync(descriptor),
      label,
      maximumBytes,
    );
    if (!sameIdentity(pathMetadata, openedMetadata)) {
      fileFail(label, "changed before read");
    }

    const chunks = [];
    let totalBytes = 0;
    while (totalBytes <= maximumBytes) {
      const remaining = maximumBytes + 1 - totalBytes;
      const target = Buffer.allocUnsafe(Math.min(64 * 1024, remaining));
      const bytesRead = fileSystem.readSync(descriptor, target, 0, target.length, null);
      if (bytesRead === 0) {
        break;
      }
      chunks.push(target.subarray(0, bytesRead));
      totalBytes += bytesRead;
    }
    if (totalBytes > maximumBytes) {
      fileFail(label, `exceeded the ${maximumBytes}-byte ceiling while reading`);
    }

    const finalMetadata = requireRegularMetadata(
      fileSystem.fstatSync(descriptor),
      label,
      maximumBytes,
    );
    if (!sameStableDescriptor(openedMetadata, finalMetadata)) {
      fileFail(label, "changed while being read");
    }
    if (totalBytes !== openedMetadata.size) {
      fileFail(label, "byte count differs from the opened descriptor size");
    }

    const finalPathMetadata = requireRegularMetadata(
      fileSystem.lstatSync(path),
      label,
      maximumBytes,
    );
    if (!sameIdentity(openedMetadata, finalPathMetadata)) {
      fileFail(label, "pathname changed while being read");
    }
    return Buffer.concat(chunks, totalBytes);
  } finally {
    fileSystem.closeSync(descriptor);
  }
}

function skipJsonWhitespace(text, state) {
  while (state.index < text.length) {
    const character = text[state.index];
    if (character !== " " && character !== "\t" && character !== "\n" && character !== "\r") {
      return;
    }
    state.index += 1;
  }
}

function parseJsonStringToken(text, state) {
  const start = state.index;
  state.index += 1;
  let escaped = false;
  while (state.index < text.length) {
    const character = text[state.index];
    const code = text.charCodeAt(state.index);
    if (code < 0x20) {
      throw new SyntaxError("JSON strings cannot contain unescaped control characters.");
    }
    state.index += 1;
    if (escaped) {
      escaped = false;
    } else if (character === "\\") {
      escaped = true;
    } else if (character === '"') {
      return JSON.parse(text.slice(start, state.index));
    }
  }
  throw new SyntaxError("JSON string was not terminated.");
}

function parseJsonPrimitive(text, state) {
  JSON_PRIMITIVE_PATTERN.lastIndex = state.index;
  const match = JSON_PRIMITIVE_PATTERN.exec(text);
  if (!match) {
    throw new SyntaxError(`Unexpected JSON token at character ${state.index}.`);
  }
  state.index += match[0].length;
  return false;
}

function parseJsonArray(text, state, depth) {
  state.index += 1;
  skipJsonWhitespace(text, state);
  if (text[state.index] === "]") {
    state.index += 1;
    return false;
  }
  let duplicate = false;
  while (true) {
    duplicate = parseJsonValue(text, state, depth) || duplicate;
    skipJsonWhitespace(text, state);
    if (text[state.index] === "]") {
      state.index += 1;
      return duplicate;
    }
    if (text[state.index] !== ",") {
      throw new SyntaxError(`Expected an array comma at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
  }
}

function parseJsonObject(text, state, depth) {
  state.index += 1;
  skipJsonWhitespace(text, state);
  if (text[state.index] === "}") {
    state.index += 1;
    return false;
  }
  const keys = new Set();
  let duplicate = false;
  while (true) {
    if (text[state.index] !== '"') {
      throw new SyntaxError(`Expected an object key at character ${state.index}.`);
    }
    const key = parseJsonStringToken(text, state);
    if (keys.has(key)) {
      duplicate = true;
    }
    keys.add(key);
    skipJsonWhitespace(text, state);
    if (text[state.index] !== ":") {
      throw new SyntaxError(`Expected an object colon at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
    duplicate = parseJsonValue(text, state, depth) || duplicate;
    skipJsonWhitespace(text, state);
    if (text[state.index] === "}") {
      state.index += 1;
      return duplicate;
    }
    if (text[state.index] !== ",") {
      throw new SyntaxError(`Expected an object comma at character ${state.index}.`);
    }
    state.index += 1;
    skipJsonWhitespace(text, state);
  }
}

function parseJsonValue(text, state, depth) {
  if (depth > MAX_JSON_NESTING_DEPTH) {
    throw new RangeError("JSON evidence nesting exceeds the reviewed limit.");
  }
  skipJsonWhitespace(text, state);
  const character = text[state.index];
  if (character === "{") {
    return parseJsonObject(text, state, depth + 1);
  }
  if (character === "[") {
    return parseJsonArray(text, state, depth + 1);
  }
  if (character === '"') {
    parseJsonStringToken(text, state);
    return false;
  }
  return parseJsonPrimitive(text, state);
}

function hasDuplicateJsonObjectKeys(text) {
  if (typeof text !== "string") {
    throw new TypeError("JSON evidence must be supplied as text.");
  }
  const state = { index: 0 };
  skipJsonWhitespace(text, state);
  const duplicate = parseJsonValue(text, state, 0);
  skipJsonWhitespace(text, state);
  if (state.index !== text.length) {
    throw new SyntaxError(`Unexpected trailing JSON content at character ${state.index}.`);
  }
  return duplicate;
}

/** Replace one receipt atomically without opening a predictable output file. */
function writeAtomically(path, content) {
  const parentDirectory = dirname(path);
  mkdirSync(parentDirectory, { recursive: true });
  const temporaryDirectory = mkdtempSync(join(parentDirectory, ".noema-release-receipt-"));
  const temporaryPath = join(temporaryDirectory, "receipt.json");
  try {
    writeFileSync(temporaryPath, content, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function parseArguments(argv) {
  const accepted = new Set([
    "--policy",
    "--release-view",
    "--release-api",
    "--verification",
    "--release-evidence",
    "--asset-dir",
    "--output",
  ]);
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
    policyPath: resolve(values.get("--policy")),
    releaseViewPath: resolve(values.get("--release-view")),
    releaseApiPath: resolve(values.get("--release-api")),
    verificationPath: resolve(values.get("--verification")),
    releaseEvidencePath: resolve(values.get("--release-evidence")),
    assetDir: resolve(values.get("--asset-dir")),
    outputPath: resolve(values.get("--output")),
  };
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireCanonicalUtcTimestamp(value, label) {
  const timestamp = requireString(value, label);
  if (timestamp !== value) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  const parsed = Date.parse(timestamp);
  if (
    !CANONICAL_UTC_TIMESTAMP_PATTERN.test(timestamp)
    || !Number.isFinite(parsed)
    || new Date(parsed).toISOString() !== timestamp
  ) {
    fail(`${label} must be a canonical UTC timestamp`);
  }
  return timestamp;
}

function readStableBytes(path, label, maximumBytes) {
  try {
    return readStableRegularFile(path, label, maximumBytes);
  } catch (error) {
    fail(`${label} could not be read safely: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseJsonBytes(bytes, label) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    fail(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
    if (hasDuplicateJsonObjectKeys(text)) {
      fail(`${label} contains duplicate object keys`);
    }
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      fail(`${label} must contain a JSON object`);
    }
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(label)) {
      throw error;
    }
    fail(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readJson(path, label) {
  const bytes = readStableBytes(path, label, MAX_JSON_BYTES);
  return { bytes, value: parseJsonBytes(bytes, label) };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function validateIdentity() {
  const repository = requireString(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const tag = requireString(process.env.NOEMA_RELEASE_TAG, "NOEMA_RELEASE_TAG");
  const commitSha = requireString(
    process.env.NOEMA_RELEASE_COMMIT_SHA || process.env.GITHUB_SHA,
    "release commit SHA",
  );
  const version = requireString(process.env.NOEMA_RELEASE_VERSION, "NOEMA_RELEASE_VERSION");
  const generatedAt = requireCanonicalUtcTimestamp(
    process.env.NOEMA_RELEASE_GENERATED_AT || new Date().toISOString(),
    "NOEMA_RELEASE_GENERATED_AT",
  );

  if (repository !== EXPECTED_REPOSITORY) {
    fail(`release repository must be ${EXPECTED_REPOSITORY}, received ${repository}`);
  }
  if (!SHA_PATTERN.test(commitSha)) {
    fail("release commit SHA must be the canonical lowercase 40-character hexadecimal identity");
  }
  if (!SEMVER_PATTERN.test(version)) {
    fail(`release version is not valid SemVer: ${version}`);
  }
  if (tag !== `v${version}`) {
    fail(`release tag must be v${version}, received ${tag}`);
  }
  return { repository, tag, commitSha, version, generatedAt };
}

function expectedAssetPaths(assetDir, sourceName) {
  return [
    resolve(assetDir, "SHA256SUMS"),
    resolve(assetDir, "attestations", "cyclonedx-sbom.sigstore.json"),
    resolve(assetDir, "noema.cdx.json"),
    resolve(assetDir, sourceName),
    resolve(assetDir, "attestations", "provenance.sigstore.json"),
    resolve(assetDir, "release-evidence.json"),
  ];
}

function sortedAssetNames(assetPaths) {
  return assetPaths.map((path) => basename(path)).sort();
}

function requireExactNames(actual, expected, label) {
  const normalized = [...actual].map(String).sort();
  if (JSON.stringify(normalized) !== JSON.stringify(expected)) {
    fail(`${label} does not match the exact release asset set: ${normalized.join(", ")}`);
  }
}

function validateChecksums(checksumsBytes, assetsByName) {
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(checksumsBytes);
  } catch (error) {
    fail(`SHA256SUMS is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const expectedNames = new Set(["release-evidence.json", "noema.cdx.json"]);
  for (const [name] of assetsByName) {
    if (name.startsWith("noema-") && name.endsWith(".tar.gz")) {
      expectedNames.add(name);
    }
  }
  const found = new Set();
  for (const line of lines) {
    const match = /^([0-9A-Fa-f]{64})\s{2}([^/\\]+)$/.exec(line);
    if (!match) {
      fail(`SHA256SUMS contains an invalid line: ${line}`);
    }
    const [, expectedDigest, name] = match;
    if (!/^[0-9a-f]{64}$/.test(expectedDigest)) {
      fail(`SHA256SUMS contains a non-canonical digest for ${name}`);
    }
    if (!expectedNames.has(name)) {
      fail(`SHA256SUMS contains an unexpected asset ${name}`);
    }
    const asset = assetsByName.get(name);
    if (!asset || asset.sha256 !== expectedDigest) {
      fail(`SHA256SUMS digest mismatch for ${name}`);
    }
    found.add(name);
  }
  requireExactNames(found, [...expectedNames].sort(), "SHA256SUMS entries");
}

function validatePolicy(policy) {
  if (policy.enabled !== true) {
    fail("immutable releases policy must report enabled=true");
  }
  if (typeof policy.enforced_by_owner !== "boolean") {
    fail("immutable releases policy enforced_by_owner must be boolean");
  }
  return {
    enabled: true,
    enforcedByOwner: policy.enforced_by_owner,
  };
}

function validateVerification(verification, expectedNames, identity) {
  if (verification.releaseVerified !== true) {
    fail("release verification must report releaseVerified=true");
  }
  const resolvedTagCommitSha = requireString(
    verification.resolvedTagCommitSha,
    "release verification resolved tag commit",
  );
  if (!SHA_PATTERN.test(resolvedTagCommitSha) || resolvedTagCommitSha !== identity.commitSha) {
    fail(`release verification resolved tag commit must be ${identity.commitSha}`);
  }
  if (!Array.isArray(verification.verifiedAssets)) {
    fail("release verification verifiedAssets must be an array");
  }
  requireExactNames(verification.verifiedAssets, expectedNames, "verified asset set");
  const verifiedAt = requireCanonicalUtcTimestamp(
    verification.verifiedAt,
    "release verification verifiedAt",
  );
  const workflowRunUrl = requireString(
    verification.workflowRunUrl,
    "release verification workflowRunUrl",
  );
  if (!workflowRunUrl.startsWith(`https://github.com/${EXPECTED_REPOSITORY}/actions/runs/`)) {
    fail("release verification workflowRunUrl must identify this repository's Actions run");
  }
  return {
    releaseVerified: true,
    resolvedTagCommitSha,
    verifiedAssets: expectedNames,
    verifiedAt,
    workflowRunUrl,
  };
}

function validateReleaseIdentity(view, api, identity, resolvedTagCommitSha) {
  if (view.isImmutable !== true) {
    fail("release view isImmutable must be true after publication");
  }
  if (api.immutable !== true) {
    fail("release API immutable must be true after publication");
  }
  if (view.tagName !== identity.tag || api.tag_name !== identity.tag) {
    fail(`release tag identity must be ${identity.tag}`);
  }
  const reportedTargetCommitish = requireString(
    view.targetCommitish,
    "release view targetCommitish",
  );
  const apiReportedTargetCommitish = requireString(
    api.target_commitish,
    "release API targetCommitish",
  );
  const viewUrl = requireString(view.url, "release view URL");
  const apiUrl = requireString(api.html_url, "release API URL");
  if (viewUrl !== apiUrl || !viewUrl.startsWith(`https://github.com/${identity.repository}/releases/`)) {
    fail("release URL must be the canonical repository release URL");
  }
  return {
    immutable: true,
    tagName: identity.tag,
    reportedTargetCommitish,
    apiReportedTargetCommitish,
    resolvedTagCommitSha,
    url: viewUrl,
  };
}

function run() {
  const args = parseArguments(process.argv.slice(2));
  const identity = validateIdentity();
  const canonicalReleaseEvidencePath = resolve(args.assetDir, "release-evidence.json");
  if (args.releaseEvidencePath !== canonicalReleaseEvidencePath) {
    fail("release evidence manifest path must identify the exact release asset");
  }
  const releaseEvidence = readJson(args.releaseEvidencePath, "release evidence manifest");
  const evidence = releaseEvidence.value;
  if (
    evidence.schemaVersion !== 1
    || evidence.source?.repository !== identity.repository
    || evidence.source?.commitSha !== identity.commitSha
    || evidence.source?.ref !== `refs/tags/${identity.tag}`
    || evidence.source?.version !== identity.version
  ) {
    fail("release evidence manifest does not match repository, tag, commit, and version identity");
  }
  const sourceName = requireString(evidence.subject?.name, "release evidence subject name");
  if (sourceName !== `noema-${identity.commitSha}.tar.gz`) {
    fail(`release evidence source archive must be noema-${identity.commitSha}.tar.gz`);
  }
  if (evidence.sbom?.name !== "noema.cdx.json") {
    fail("release evidence SBOM name must be noema.cdx.json");
  }

  const assetPaths = expectedAssetPaths(args.assetDir, sourceName);
  const expectedNames = sortedAssetNames(assetPaths);
  const assetsByName = new Map();
  for (const path of assetPaths) {
    const label = `release asset ${basename(path)}`;
    const bytes = path === canonicalReleaseEvidencePath
      ? releaseEvidence.bytes
      : readStableBytes(path, label, MAX_ASSET_BYTES);
    assetsByName.set(basename(path), {
      name: basename(path),
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      retainedBytes: bytes,
    });
  }
  if (assetsByName.get(sourceName)?.sha256 !== evidence.subject.sha256) {
    fail("release evidence source archive digest mismatch");
  }
  if (assetsByName.get("noema.cdx.json")?.sha256 !== evidence.sbom.sha256) {
    fail("release evidence SBOM digest mismatch");
  }
  const checksumAsset = assetsByName.get("SHA256SUMS");
  if (!checksumAsset) {
    fail("SHA256SUMS release asset is missing");
  }
  validateChecksums(checksumAsset.retainedBytes, assetsByName);

  const policy = validatePolicy(readJson(args.policyPath, "immutable release policy response").value);
  const releaseView = readJson(args.releaseViewPath, "release view response").value;
  const releaseApi = readJson(args.releaseApiPath, "release API response").value;
  const verification = validateVerification(
    readJson(args.verificationPath, "release verification response").value,
    expectedNames,
    identity,
  );
  const release = validateReleaseIdentity(
    releaseView,
    releaseApi,
    identity,
    verification.resolvedTagCommitSha,
  );
  if (!Array.isArray(releaseView.assets) || !Array.isArray(releaseApi.assets)) {
    fail("release view and API assets must be arrays");
  }
  requireExactNames(
    releaseView.assets.map((asset) => asset?.name),
    expectedNames,
    "release view assets",
  );
  requireExactNames(
    releaseApi.assets.map((asset) => asset?.name),
    expectedNames,
    "release API assets",
  );

  const apiAssets = new Map(releaseApi.assets.map((asset) => [asset?.name, asset]));
  const assets = expectedNames.map((name) => {
    const local = assetsByName.get(name);
    const remote = apiAssets.get(name);
    if (!local || !remote) {
      fail(`release asset ${name} is missing`);
    }
    const digestValue = String(remote.digest || "");
    const digestMatch = DIGEST_PATTERN.exec(digestValue);
    if (!digestMatch) {
      fail(`release asset digest must be canonical lowercase sha256 for ${name}`);
    }
    if (digestMatch[1] !== local.sha256) {
      fail(`release asset digest mismatch for ${name}`);
    }
    if (!Number.isSafeInteger(remote.size) || remote.size < 0) {
      fail(`release asset byte size must be a non-negative safe integer for ${name}`);
    }
    if (remote.size !== local.bytes) {
      fail(`release asset byte size mismatch for ${name}`);
    }
    return {
      name,
      bytes: local.bytes,
      sha256: local.sha256,
      apiDigest: digestValue,
    };
  });

  const receipt = {
    schemaVersion: 1,
    generatedAt: identity.generatedAt,
    source: {
      repository: identity.repository,
      tag: identity.tag,
      commitSha: identity.commitSha,
      version: identity.version,
    },
    immutableReleasePolicy: policy,
    release,
    verification,
    assets,
  };
  writeAtomically(args.outputPath, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(
    `release-publication-receipt: PASS repository=${identity.repository} tag=${identity.tag} head=${identity.commitSha}`,
  );
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`release-publication-receipt: FAIL: ${message.slice(0, 1000)}`);
  process.exitCode = 1;
}
