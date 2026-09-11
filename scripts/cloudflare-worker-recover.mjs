#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { TextDecoder } from "node:util";
import { fileURLToPath } from "node:url";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { readNoemaWorkerConfig } from "./lib/cloudflare-worker-config.mjs";
import {
  planExactRecoveryDeployment,
  verifyExactRecoveryStatus,
} from "./lib/cloudflare-recovery-plan.mjs";
import { hasDuplicateJsonObjectKeys } from "./normalize-commercial-readiness-evidence.mjs";

const API_ORIGIN = "https://api.cloudflare.com";
const API_PREFIX = "/client/v4";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_RECEIPT_BYTES = 16 * 1024 * 1024;
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function exactToolSource(repositoryRoot, expectedSourceSha) {
  const expected = expectedSourceSha.toLowerCase();
  if (!SHA_PATTERN.test(expected)) {
    throw new Error("NOEMA_RECOVERY_TOOL_SOURCE_SHA is not a full commit SHA");
  }
  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().toLowerCase();
  if (head !== expected || !SHA_PATTERN.test(head)) {
    throw new Error("NOEMA_RECOVERY_TOOL_SOURCE_SHA does not match exact checked-out repository HEAD");
  }
  const dirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (dirty !== "") {
    throw new Error("Refusing recovery from a dirty checkout; use reviewed exact source");
  }
  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== "ContextualWisdomLab/noema") {
    throw new Error("GITHUB_REPOSITORY does not identify ContextualWisdomLab/noema");
  }
  return head;
}

function readReceipt(path) {
  if (!existsSync(path)) throw new Error(`Recovery deployment evidence is missing: ${path}`);
  const pathMetadata = lstatSync(path);
  if (pathMetadata.isSymbolicLink() || !pathMetadata.isFile() || pathMetadata.size <= 0 || pathMetadata.size > MAX_RECEIPT_BYTES) {
    throw new Error("Recovery deployment evidence must be a bounded non-empty regular file");
  }
  if (!Number.isInteger(constants.O_RDONLY) || !Number.isInteger(constants.O_NOFOLLOW)) {
    throw new Error("Recovery deployment evidence requires no-follow file opening");
  }
  const descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.dev !== pathMetadata.dev
      || opened.ino !== pathMetadata.ino
      || opened.size !== pathMetadata.size
    ) {
      throw new Error("Recovery deployment evidence changed identity before read");
    }
    const bytes = readFileSync(descriptor);
    const finalMetadata = fstatSync(descriptor);
    if (
      finalMetadata.dev !== opened.dev
      || finalMetadata.ino !== opened.ino
      || finalMetadata.size !== opened.size
      || bytes.length !== opened.size
    ) {
      throw new Error("Recovery deployment evidence changed during read");
    }
    let text;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Recovery deployment evidence contains invalid UTF-8");
    }
    if (hasDuplicateJsonObjectKeys(text)) {
      throw new Error("Recovery deployment evidence contains a duplicate decoded JSON key");
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error("Recovery deployment evidence is invalid JSON");
    }
  } finally {
    closeSync(descriptor);
  }
}

async function parseCloudflareResponse(response, operation) {
  const text = await response.text();
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new Error(`${operation} returned an oversized response`);
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`${operation} returned non-JSON data (HTTP ${response.status})`);
  }
  if (!response.ok || payload?.success === false) {
    const codes = Array.isArray(payload?.errors)
      ? payload.errors.map((error) => error?.code).filter(Boolean).join(",")
      : "";
    throw new Error(`${operation} failed (HTTP ${response.status}${codes ? `; codes=${codes}` : ""})`);
  }
  return payload?.result ?? payload;
}

async function cloudflareJson(url, token, operation, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(120_000),
  });
  return parseCloudflareResponse(response, operation);
}

function activeDeploymentId(result) {
  const deployments = Array.isArray(result) ? result : result?.deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) {
    throw new Error("Cloudflare recovery preflight did not return an active deployment");
  }
  const deploymentId = deployments[0]?.id;
  if (typeof deploymentId !== "string" || !UUID_PATTERN.test(deploymentId)) {
    throw new Error("Cloudflare recovery preflight returned a non-UUID active deployment ID");
  }
  return deploymentId;
}

function canonicalVersions(versions, label) {
  if (!Array.isArray(versions) || versions.length < 1 || versions.length > 2) {
    throw new Error(`${label} must contain one or two versions`);
  }
  return versions.map((version) => {
    if (typeof version?.version_id !== "string" || !UUID_PATTERN.test(version.version_id)) {
      throw new Error(`${label} contains a non-UUID version ID`);
    }
    if (typeof version.percentage !== "number" || !Number.isFinite(version.percentage)) {
      throw new Error(`${label} contains a non-numeric percentage`);
    }
    return { version_id: version.version_id.toLowerCase(), percentage: version.percentage };
  }).sort((left, right) => left.version_id.localeCompare(right.version_id));
}

function assertRestoredDistribution(deployment, request) {
  const deploymentId = deployment?.id;
  if (typeof deploymentId !== "string" || !UUID_PATTERN.test(deploymentId)) {
    throw new Error("Cloudflare recovery returned a non-UUID deployment ID");
  }
  const expected = canonicalVersions(request.versions, "recovery request versions");
  const actual = canonicalVersions(deployment?.versions, "recovery response versions");
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Cloudflare recovery response does not match the exact requested distribution");
  }
  return { deploymentId: deploymentId.toLowerCase(), versions: actual };
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const config = await readNoemaWorkerConfig(repositoryRoot);
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const receiptPath = resolve(requiredEnvironment("NOEMA_RECOVERY_DEPLOYMENT_EVIDENCE_PATH"));
  const expectedToolSource = requiredEnvironment("NOEMA_RECOVERY_TOOL_SOURCE_SHA");
  const apiToken = readDelegatedGithubToken(requiredEnvironment("NOEMA_CLOUDFLARE_API_TOKEN_PATH"));
  const scriptName = process.env.CLOUDFLARE_WORKER_NAME?.trim() || config.name;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID is malformed");
  if (!SCRIPT_NAME_PATTERN.test(scriptName)) throw new Error("CLOUDFLARE_WORKER_NAME is malformed");

  const toolSourceSha = exactToolSource(repositoryRoot, expectedToolSource);
  const evidence = readReceipt(receiptPath);
  const encodedAccount = encodeURIComponent(accountId);
  const encodedScript = encodeURIComponent(scriptName);
  const deploymentsUrl = `${API_ORIGIN}${API_PREFIX}/accounts/${encodedAccount}/workers/scripts/${encodedScript}/deployments`;

  // The read immediately before mutation prevents a stale incident receipt from overwriting a newer operator action.
  const current = await cloudflareJson(deploymentsUrl, apiToken, "Worker recovery preflight");
  const currentDeploymentId = activeDeploymentId(current);
  const plan = planExactRecoveryDeployment(evidence, currentDeploymentId, scriptName);

  const restored = await cloudflareJson(deploymentsUrl, apiToken, "Worker exact-distribution recovery", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(plan.request),
  });
  const mutationResponse = assertRestoredDistribution(restored, plan.request);

  // Mutation acknowledgement is not active-state authority. Re-read provider state before reporting recovery success.
  const postMutationStatus = await cloudflareJson(
    deploymentsUrl,
    apiToken,
    "Worker recovery status verification",
  );
  const verified = verifyExactRecoveryStatus(
    postMutationStatus,
    mutationResponse.deploymentId,
    plan.request,
  );

  process.stdout.write(`${JSON.stringify({
    worker: scriptName,
    recovery_tool_source_sha: toolSourceSha,
    failed_deployment_id: plan.expectedCurrentDeploymentId,
    previous_deployment_id: plan.previousDeploymentId,
    recovery_deployment_id: verified.deploymentId,
    restored_versions: verified.versions,
  })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Noema Worker recovery failed: ${message}\n`);
  process.exitCode = 1;
});
