#!/usr/bin/env node
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { readBoundedCloudflareJsonResponse } from "./lib/cloudflare-response.mjs";
import { readNoemaWorkerConfig } from "./lib/cloudflare-worker-config.mjs";

const API_ORIGIN = "https://api.cloudflare.com";
const API_PREFIX = "/client/v4";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

async function parseCloudflareResponse(response) {
  return readBoundedCloudflareJsonResponse(
    response,
    "Worker deployment status",
    MAX_RESPONSE_BYTES,
  );
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const config = await readNoemaWorkerConfig(repositoryRoot);
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  // The shared reader is credential-generic at the file boundary despite its historical GitHub name.
  const apiToken = readDelegatedGithubToken(requiredEnvironment("NOEMA_CLOUDFLARE_API_TOKEN_PATH"));
  const scriptName = process.env.CLOUDFLARE_WORKER_NAME?.trim() || config.name;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID is malformed");
  if (!SCRIPT_NAME_PATTERN.test(scriptName)) throw new Error("CLOUDFLARE_WORKER_NAME is malformed");

  const encodedAccount = encodeURIComponent(accountId);
  const encodedScript = encodeURIComponent(scriptName);
  const response = await fetch(
    `${API_ORIGIN}${API_PREFIX}/accounts/${encodedAccount}/workers/scripts/${encodedScript}/deployments`,
    {
      headers: { authorization: `Bearer ${apiToken}` },
      signal: AbortSignal.timeout(120_000),
    },
  );
  const deployments = await parseCloudflareResponse(response);
  process.stdout.write(`${JSON.stringify({
    observed_at: new Date().toISOString(),
    deployments,
  })}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Noema Worker deployment status failed: ${message}\n`);
  process.exitCode = 1;
});
