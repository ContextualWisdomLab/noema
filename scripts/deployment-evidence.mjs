#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const EXPECTED_REPOSITORY = "ContextualWisdomLab/noema";
const EXPECTED_WORKER = "noema";
const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const MAX_WRANGLER_RECORDS = 1_000;
const shaPattern = /^[0-9a-f]{40}$/i;
const digestPattern = /^[0-9a-f]{64}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tagPattern = /^v(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

function fail(message) {
  throw new Error(message);
}

function requireObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${label} must be a JSON object`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    fail(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function requireTimestamp(value, label) {
  const timestamp = requireString(value, label);
  if (Number.isNaN(Date.parse(timestamp))) {
    fail(`${label} must be an ISO-compatible timestamp`);
  }
  return timestamp;
}

function requireHttps(value, label) {
  const raw = requireString(value, label);
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${label} must be an absolute HTTPS URL`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    fail(`${label} must be an absolute HTTPS URL without embedded credentials`);
  }
  return url;
}

function requireDigest(value, label) {
  const digest = requireString(value, label);
  if (!digestPattern.test(digest)) {
    fail(`${label} must be a 64-character hexadecimal SHA-256 digest`);
  }
  return digest.toLowerCase();
}

export function parseWranglerOutput(text) {
  if (typeof text !== "string" || text.length === 0) {
    fail("Wrangler output must not be empty");
  }
  if (Buffer.byteLength(text) > MAX_INPUT_BYTES) {
    fail(`Wrangler output exceeds the ${MAX_INPUT_BYTES}-byte limit`);
  }
  const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0 || lines.length > MAX_WRANGLER_RECORDS) {
    fail(`Wrangler output must contain between 1 and ${MAX_WRANGLER_RECORDS} JSON records`);
  }
  const records = lines.map((line, index) => {
    try {
      return requireObject(JSON.parse(line), `Wrangler record ${index + 1}`);
    } catch (error) {
      fail(`Wrangler record ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const failed = records.find((record) => record.type === "command-failed");
  if (failed) {
    fail(`Wrangler reported command-failed: ${String(failed.message || failed.error || "unknown error")}`);
  }
  return records;
}

export function normalizeDeployments(value) {
  if (Array.isArray(value)) {
    return value;
  }
  const object = requireObject(value, "deployment status");
  if (Array.isArray(object.deployments)) {
    return object.deployments;
  }
  if (Array.isArray(object.result)) {
    return object.result;
  }
  if (object.result && typeof object.result === "object" && Array.isArray(object.result.deployments)) {
    return object.result.deployments;
  }
  if (Array.isArray(object.versions)) {
    return [object];
  }
  fail("deployment status does not contain a deployment array");
}

function deploymentVersion(deployment, expectedVersionId, label) {
  const object = requireObject(deployment, label);
  const versions = Array.isArray(object.versions) ? object.versions : [];
  if (versions.length === 0) {
    fail(`${label} does not contain any Worker versions`);
  }
  const match = versions.find((version) => version?.version_id === expectedVersionId);
  if (!match) {
    fail(`${label} does not identify the active deployment for Worker version ${expectedVersionId}`);
  }
  if (Number(match.percentage) !== 100 || versions.length !== 1) {
    fail(`${label} must route exactly 100% of traffic to Worker version ${expectedVersionId}`);
  }
  return match;
}

function firstVersionIdentity(deployments) {
  if (deployments.length === 0) {
    return { deploymentId: null, workerVersionId: null };
  }
  const deployment = requireObject(deployments[0], "previous deployment");
  const version = Array.isArray(deployment.versions) ? deployment.versions[0] : null;
  return {
    deploymentId: typeof deployment.id === "string" ? deployment.id : null,
    workerVersionId: typeof version?.version_id === "string" ? version.version_id : null,
  };
}

export function buildDeploymentEvidence(input) {
  const root = requireObject(input, "deployment evidence input");
  const identity = requireObject(root.identity, "deployment identity");
  const repository = requireString(identity.repository, "deployment repository");
  const releaseTag = requireString(identity.releaseTag, "release tag");
  const commitSha = requireString(identity.commitSha, "deployment commit SHA");
  const environment = requireString(identity.environment, "deployment environment");
  const workflowRunUrl = requireString(identity.workflowRunUrl, "workflow run URL");
  const generatedAt = requireTimestamp(identity.generatedAt, "deployment generatedAt");

  if (repository !== EXPECTED_REPOSITORY) {
    fail(`deployment repository must be ${EXPECTED_REPOSITORY}, received ${repository}`);
  }
  const tagMatch = releaseTag.match(tagPattern);
  if (!tagMatch) {
    fail(`release tag must be semantic version tag v<version>, received ${releaseTag}`);
  }
  if (!shaPattern.test(commitSha)) {
    fail("deployment commit SHA must be a full 40-character hexadecimal SHA");
  }
  if (!new Set(["production", "staging"]).has(environment)) {
    fail(`deployment environment must be production or staging, received ${environment}`);
  }
  requireHttps(workflowRunUrl.startsWith("http") ? workflowRunUrl : `https://github.com/${workflowRunUrl}`, "workflow run URL");

  const releaseView = requireObject(root.releaseView, "release view");
  if (releaseView.isImmutable !== true) {
    fail("GitHub release must be immutable before deployment");
  }
  if (releaseView.tagName !== releaseTag) {
    fail(`immutable release tag ${String(releaseView.tagName)} does not match ${releaseTag}`);
  }
  const releaseUrl = requireHttps(releaseView.url, "immutable release URL").toString();

  const releaseEvidence = requireObject(root.releaseEvidence, "release evidence");
  if (releaseEvidence.schemaVersion !== 1) {
    fail("release evidence schemaVersion must be 1");
  }
  const releaseSource = requireObject(releaseEvidence.source, "release evidence source");
  if (releaseSource.repository !== repository) {
    fail(`release evidence repository must be ${repository}`);
  }
  if (releaseSource.commitSha !== commitSha) {
    fail(`release evidence commit SHA must match deployment commit SHA ${commitSha}`);
  }
  if (releaseSource.ref !== `refs/tags/${releaseTag}`) {
    fail(`release evidence ref must be refs/tags/${releaseTag}`);
  }
  if (releaseSource.version !== tagMatch[1]) {
    fail(`release evidence version must be ${tagMatch[1]}`);
  }

  const wranglerOutput = Array.isArray(root.wranglerOutput)
    ? root.wranglerOutput
    : fail("wranglerOutput must be an array of structured records");
  const failed = wranglerOutput.find((record) => record?.type === "command-failed");
  if (failed) {
    fail(`Wrangler reported command-failed: ${String(failed.message || failed.error || "unknown error")}`);
  }
  const deployRecord = [...wranglerOutput].reverse().find((record) => record?.type === "deploy");
  if (!deployRecord) {
    fail("Wrangler output does not contain a successful deploy record");
  }
  const workerName = requireString(deployRecord.worker_name, "Wrangler worker name");
  const workerVersionId = requireString(deployRecord.version_id, "Wrangler Worker version ID");
  const deployedAt = requireTimestamp(deployRecord.timestamp, "Wrangler deploy timestamp");
  if (workerName !== EXPECTED_WORKER) {
    fail(`Wrangler worker name must be ${EXPECTED_WORKER}, received ${workerName}`);
  }
  if (!uuidPattern.test(workerVersionId)) {
    fail("Wrangler Worker version ID must be a UUID");
  }
  const targets = Array.isArray(deployRecord.targets)
    ? deployRecord.targets.map((target, index) => requireHttps(target, `Wrangler target ${index + 1}`).toString())
    : [];
  if (targets.length === 0) {
    fail("Wrangler deploy record must contain at least one HTTPS target");
  }

  const beforeDeployments = normalizeDeployments(root.beforeDeployments);
  const afterDeployments = normalizeDeployments(root.afterDeployments);
  if (afterDeployments.length === 0) {
    fail("post-deployment status must contain an active deployment");
  }
  const activeDeployment = requireObject(afterDeployments[0], "active deployment");
  deploymentVersion(activeDeployment, workerVersionId, "active deployment");
  const deploymentId = requireString(activeDeployment.id, "active deployment ID");
  const deploymentCreatedAt = requireTimestamp(activeDeployment.created_on, "active deployment created_on");
  if (!uuidPattern.test(deploymentId)) {
    fail("active deployment ID must be a UUID");
  }
  const previous = firstVersionIdentity(beforeDeployments);

  const smokeEvidence = requireObject(root.smokeEvidence, "smoke evidence");
  if (smokeEvidence.passed !== true) {
    fail("smoke evidence must record passed=true");
  }
  const smokeTimestamp = requireTimestamp(smokeEvidence.timestamp, "smoke evidence timestamp");
  const exchangeUrl = requireHttps(smokeEvidence.noema_exchange_url, "smoke evidence Noema URL");
  if (!targets.some((target) => new URL(target).origin === exchangeUrl.origin)) {
    fail("smoke evidence URL origin must match a Wrangler deployment target");
  }

  const kpiEvidence = requireObject(root.kpiEvidence, "KPI evidence");
  if (kpiEvidence.status !== "PASS" || kpiEvidence.strict !== true || Number(kpiEvidence.requireWindowDays) < 30) {
    fail("KPI evidence must be strict PASS with a required window of at least 30 days");
  }
  const kpiExecutedAt = requireTimestamp(kpiEvidence.executedAt, "KPI evidence executedAt");

  const digests = requireObject(root.digests, "evidence digests");
  const releaseEvidenceSha256 = requireDigest(digests.releaseEvidenceSha256, "release evidence digest");
  const smokeEvidenceSha256 = requireDigest(digests.smokeEvidenceSha256, "smoke evidence digest");
  const kpiEvidenceSha256 = requireDigest(digests.kpiEvidenceSha256, "KPI evidence digest");

  return {
    schemaVersion: 1,
    generatedAt,
    source: {
      repository,
      releaseTag,
      releaseRef: `refs/tags/${releaseTag}`,
      releaseUrl,
      version: tagMatch[1],
      commitSha: commitSha.toLowerCase(),
      releaseEvidenceSha256,
    },
    deployment: {
      environment,
      workerName,
      workerVersionId,
      deploymentId,
      deployedAt,
      deploymentCreatedAt,
      trafficPercentage: 100,
      targets,
      workflowRunUrl,
    },
    rollback: {
      previousDeploymentId: previous.deploymentId,
      previousWorkerVersionId: previous.workerVersionId,
    },
    validation: {
      immutableRelease: true,
      strictKpi: true,
      smokePassed: true,
      kpiExecutedAt,
      smokeTimestamp,
      kpiEvidenceSha256,
      smokeEvidenceSha256,
    },
    evidenceBoundary: {
      proves: "immutable source release deployed as the active Cloudflare Worker version and post-deployment checks passed",
      doesNotProve: ["paid customer operation", "revenue", "transfer completion"],
    },
  };
}

function parseArguments(argv) {
  const accepted = new Set([
    "--wrangler-output",
    "--before-deployments",
    "--after-deployments",
    "--smoke",
    "--kpi",
    "--release-evidence",
    "--release-view",
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
    values.set(flag, resolve(value));
  }
  for (const flag of accepted) {
    if (!values.has(flag)) {
      fail(`required argument ${flag} is missing`);
    }
  }
  return values;
}

function readRegularFile(path, label) {
  if (!existsSync(path)) {
    fail(`${label} does not exist: ${path}`);
  }
  if (lstatSync(path).isSymbolicLink()) {
    fail(`${label} must not be a symbolic link`);
  }
  const status = statSync(path);
  if (!status.isFile() || status.size <= 0 || status.size > MAX_INPUT_BYTES) {
    fail(`${label} must be a non-empty regular file no larger than ${MAX_INPUT_BYTES} bytes`);
  }
  return readFileSync(path, "utf8");
}

function readJson(path, label) {
  try {
    return JSON.parse(readRegularFile(path, label));
  } catch (error) {
    fail(`${label} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sha256(path, label) {
  return createHash("sha256").update(readRegularFile(path, label)).digest("hex");
}

function run() {
  const args = parseArguments(process.argv.slice(2));
  const outputPath = args.get("--output");
  if (existsSync(outputPath) && lstatSync(outputPath).isSymbolicLink()) {
    fail("deployment evidence output must not be a symbolic link");
  }
  const releaseEvidencePath = args.get("--release-evidence");
  const smokePath = args.get("--smoke");
  const kpiPath = args.get("--kpi");
  const evidence = buildDeploymentEvidence({
    identity: {
      repository: process.env.GITHUB_REPOSITORY,
      releaseTag: process.env.NOEMA_DEPLOY_RELEASE_TAG,
      commitSha: process.env.NOEMA_DEPLOY_COMMIT_SHA,
      environment: process.env.NOEMA_DEPLOY_ENVIRONMENT,
      workflowRunUrl: process.env.NOEMA_DEPLOY_WORKFLOW_RUN_URL,
      generatedAt: process.env.NOEMA_DEPLOY_GENERATED_AT || new Date().toISOString(),
    },
    releaseView: readJson(args.get("--release-view"), "release view"),
    releaseEvidence: readJson(releaseEvidencePath, "release evidence"),
    wranglerOutput: parseWranglerOutput(readRegularFile(args.get("--wrangler-output"), "Wrangler output")),
    beforeDeployments: readJson(args.get("--before-deployments"), "pre-deployment status"),
    afterDeployments: readJson(args.get("--after-deployments"), "post-deployment status"),
    smokeEvidence: readJson(smokePath, "smoke evidence"),
    kpiEvidence: readJson(kpiPath, "KPI evidence"),
    digests: {
      releaseEvidenceSha256: sha256(releaseEvidencePath, "release evidence"),
      smokeEvidenceSha256: sha256(smokePath, "smoke evidence"),
      kpiEvidenceSha256: sha256(kpiPath, "KPI evidence"),
    },
  });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o644 });
  console.log(`deployment-evidence: PASS (${outputPath})`);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  try {
    run();
  } catch (error) {
    console.error(`deployment-evidence: FAIL: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
