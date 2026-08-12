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
import { basename, dirname, resolve } from "node:path";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 512 * 1024 * 1024;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/i;
const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function fail(message) {
  throw new Error(message);
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

function requireRegularFile(path, label, maxBytes = MAX_JSON_BYTES) {
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

function readJson(path, label) {
  requireRegularFile(path, label);
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(readFileSync(path));
  } catch (error) {
    fail(`${label} is not valid UTF-8: ${error instanceof Error ? error.message : String(error)}`);
  }
  try {
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

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function validateIdentity() {
  const repository = requireString(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
  const tag = requireString(process.env.NOEMA_RELEASE_TAG, "NOEMA_RELEASE_TAG");
  const commitSha = requireString(
    process.env.NOEMA_RELEASE_COMMIT_SHA || process.env.GITHUB_SHA,
    "release commit SHA",
  );
  const version = requireString(process.env.NOEMA_RELEASE_VERSION, "NOEMA_RELEASE_VERSION");
  const generatedAt = requireString(
    process.env.NOEMA_RELEASE_GENERATED_AT || new Date().toISOString(),
    "NOEMA_RELEASE_GENERATED_AT",
  );

  if (repository !== EXPECTED_REPOSITORY) {
    fail(`release repository must be ${EXPECTED_REPOSITORY}, received ${repository}`);
  }
  if (!SHA_PATTERN.test(commitSha)) {
    fail("release commit SHA must be a full 40-character hexadecimal SHA");
  }
  if (!SEMVER_PATTERN.test(version)) {
    fail(`release version is not valid SemVer: ${version}`);
  }
  if (tag !== `v${version}`) {
    fail(`release tag must be v${version}, received ${tag}`);
  }
  if (Number.isNaN(Date.parse(generatedAt))) {
    fail("NOEMA_RELEASE_GENERATED_AT must be an ISO-compatible timestamp");
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

function validateChecksums(checksumsPath, assetsByName) {
  const lines = readFileSync(checksumsPath, "utf8")
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
    const match = /^([0-9a-f]{64})\s{2}([^/\\]+)$/i.exec(line);
    if (!match) {
      fail(`SHA256SUMS contains an invalid line: ${line}`);
    }
    const [, expectedDigest, name] = match;
    if (!expectedNames.has(name)) {
      fail(`SHA256SUMS contains an unexpected asset ${name}`);
    }
    const asset = assetsByName.get(name);
    if (!asset || asset.sha256 !== expectedDigest.toLowerCase()) {
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
  const verifiedAt = requireString(verification.verifiedAt, "release verification verifiedAt");
  if (Number.isNaN(Date.parse(verifiedAt))) {
    fail("release verification verifiedAt must be an ISO-compatible timestamp");
  }
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
    "release API target_commitish",
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
  const evidence = readJson(args.releaseEvidencePath, "release evidence manifest");
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
    const status = requireRegularFile(path, `release asset ${basename(path)}`, MAX_ASSET_BYTES);
    assetsByName.set(basename(path), {
      name: basename(path),
      bytes: status.size,
      sha256: sha256(path),
    });
  }
  if (assetsByName.get(sourceName)?.sha256 !== evidence.subject.sha256) {
    fail("release evidence source archive digest mismatch");
  }
  if (assetsByName.get("noema.cdx.json")?.sha256 !== evidence.sbom.sha256) {
    fail("release evidence SBOM digest mismatch");
  }
  validateChecksums(resolve(args.assetDir, "SHA256SUMS"), assetsByName);

  const policy = validatePolicy(readJson(args.policyPath, "immutable release policy response"));
  const releaseView = readJson(args.releaseViewPath, "release view response");
  const releaseApi = readJson(args.releaseApiPath, "release API response");
  const verification = validateVerification(
    readJson(args.verificationPath, "release verification response"),
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
    const digestMatch = DIGEST_PATTERN.exec(String(remote.digest || ""));
    if (!digestMatch || digestMatch[1].toLowerCase() !== local.sha256) {
      fail(`release asset digest mismatch for ${name}`);
    }
    if (Number(remote.size) !== local.bytes) {
      fail(`release asset byte size mismatch for ${name}`);
    }
    return {
      name,
      bytes: local.bytes,
      sha256: local.sha256,
      apiDigest: String(remote.digest),
    };
  });

  if (existsSync(args.outputPath) && lstatSync(args.outputPath).isSymbolicLink()) {
    fail("release publication receipt output must not be a symbolic link");
  }
  mkdirSync(dirname(args.outputPath), { recursive: true, mode: 0o755 });
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
  writeFileSync(args.outputPath, `${JSON.stringify(receipt, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o644,
  });
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
