#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, rm } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readDelegatedGithubToken } from "./lib/delegated-github-token.mjs";
import { requestCloudflareJson } from "./lib/cloudflare-response.mjs";
import {
  readNoemaWorkerConfig,
  validateExistingDurableObjectBindings,
} from "./lib/cloudflare-worker-config.mjs";

const API_ORIGIN = "https://api.cloudflare.com";
const API_PREFIX = "/client/v4";
const REPOSITORY_URL = "https://github.com/ContextualWisdomLab/noema";
const REQUIRED_SECRET_BINDINGS = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY_PEM"];
const OPTIONAL_SECRET_BINDINGS = ["GITHUB_APP_INSTALLATION_ID"];
const SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9_-]{1,32}$/u;
const SCRIPT_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function repositorySourceSha(repositoryRoot, expectedSourceSha) {
  const expected = expectedSourceSha.toLowerCase();
  if (!SHA_PATTERN.test(expected)) {
    throw new Error("NOEMA_DEPLOY_SOURCE_SHA is not a full commit SHA");
  }

  const head = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  }).trim().toLowerCase();
  if (!SHA_PATTERN.test(head)) throw new Error("Repository HEAD is not a full commit SHA");
  if (expected !== head) {
    throw new Error("NOEMA_DEPLOY_SOURCE_SHA does not match the exact checked-out repository HEAD");
  }

  const dirty = execFileSync("git", ["status", "--porcelain=v1", "--untracked-files=all"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (dirty !== "") {
    throw new Error("Refusing deployment from a dirty checkout; commit the exact source first");
  }

  if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_REPOSITORY !== "ContextualWisdomLab/noema") {
    throw new Error("GITHUB_REPOSITORY does not identify ContextualWisdomLab/noema");
  }
  return head;
}

function verifyExistingRuntimeBindings(config, settings) {
  const current = validateExistingDurableObjectBindings(config, settings);
  for (const secretName of REQUIRED_SECRET_BINDINGS) {
    if (current.get(secretName)?.type !== "secret_text") {
      throw new Error(`Existing Worker is missing required secret binding: ${secretName}`);
    }
  }
  return current;
}

function uploadBindings(config, currentBindings) {
  const bindings = [
    ...Object.entries(config.vars).map(([name, text]) => ({
      type: "plain_text",
      name,
      text,
    })),
    ...config.durableObjects.map(({ name, class_name }) => ({
      type: "durable_object_namespace",
      name,
      class_name,
    })),
    ...REQUIRED_SECRET_BINDINGS.map((name) => ({
      type: "inherit",
      name,
      version_id: "latest",
    })),
  ];
  for (const name of OPTIONAL_SECRET_BINDINGS) {
    if (currentBindings.get(name)?.type === "secret_text") {
      bindings.push({ type: "inherit", name, version_id: "latest" });
    }
  }
  return bindings;
}

async function bundleWorker(repositoryRoot, entryPoint, outputFile) {
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    sourcemap: false,
    legalComments: "none",
    logLevel: "warning",
  });
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const config = await readNoemaWorkerConfig(repositoryRoot);
  const accountId = requiredEnvironment("CLOUDFLARE_ACCOUNT_ID");
  const expectedSourceSha = requiredEnvironment("NOEMA_DEPLOY_SOURCE_SHA");
  // The shared reader is credential-generic at the file boundary despite its historical GitHub name.
  const apiToken = readDelegatedGithubToken(requiredEnvironment("NOEMA_CLOUDFLARE_API_TOKEN_PATH"));
  const scriptName = process.env.CLOUDFLARE_WORKER_NAME?.trim() || config.name;
  if (!ACCOUNT_ID_PATTERN.test(accountId)) throw new Error("CLOUDFLARE_ACCOUNT_ID is malformed");
  if (!SCRIPT_NAME_PATTERN.test(scriptName)) throw new Error("CLOUDFLARE_WORKER_NAME is malformed");

  const sourceSha = repositorySourceSha(repositoryRoot, expectedSourceSha);
  const encodedAccount = encodeURIComponent(accountId);
  const encodedScript = encodeURIComponent(scriptName);
  const settingsUrl = `${API_ORIGIN}${API_PREFIX}/accounts/${encodedAccount}/workers/scripts/${encodedScript}/settings`;
  const settings = await requestCloudflareJson(settingsUrl, apiToken, "Worker settings read");
  const currentBindings = verifyExistingRuntimeBindings(config, settings);

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "noema-worker-deploy-"));
  const moduleName = "worker.mjs";
  const outputFile = join(temporaryDirectory, moduleName);
  try {
    await bundleWorker(repositoryRoot, config.main, outputFile);
    const moduleBytes = await readFile(outputFile);
    const metadata = {
      main_module: moduleName,
      compatibility_date: config.compatibilityDate,
      annotations: {
        "workers/commit_sha": sourceSha,
        "workers/repository_url": REPOSITORY_URL,
        "workers/message": `Noema source ${sourceSha}`,
        "workers/tag": sourceSha.slice(0, 12),
      },
      exports: config.exports,
      bindings: uploadBindings(config, currentBindings),
    };
    const form = new FormData();
    form.append(
      "metadata",
      new Blob([JSON.stringify(metadata)], { type: "application/json" }),
      "metadata.json",
    );
    form.append(
      moduleName,
      new Blob([moduleBytes], { type: "application/javascript+module" }),
      moduleName,
    );

    const versionsPath = `/accounts/${encodedAccount}/workers/scripts/${encodedScript}/versions`;
    const version = await requestCloudflareJson(
      `${API_ORIGIN}${API_PREFIX}${versionsPath}?bindings_inherit=strict`,
      apiToken,
      "Worker version upload",
      { method: "POST", body: form },
    );
    const versionId = version?.id;
    if (typeof versionId !== "string" || !UUID_PATTERN.test(versionId)) {
      throw new Error("Worker version upload returned a non-UUID version id");
    }

    const deployment = await requestCloudflareJson(
      `${API_ORIGIN}${API_PREFIX}/accounts/${encodedAccount}/workers/scripts/${encodedScript}/deployments`,
      apiToken,
      "Worker deployment",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          strategy: "percentage",
          versions: [{ version_id: versionId, percentage: 100 }],
          annotations: {
            "workers/message": `Deploy Noema ${sourceSha}`,
            "workers/triggered_by": "noema-direct-api-toolchain",
          },
        }),
      },
    );
    const deploymentId = deployment?.id;
    if (typeof deploymentId !== "string" || !UUID_PATTERN.test(deploymentId)) {
      throw new Error("Worker deployment returned a non-UUID deployment id");
    }

    process.stdout.write(`${JSON.stringify({
      worker: scriptName,
      source_sha: sourceSha,
      version_id: versionId,
      deployment_id: deploymentId,
    })}\n`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Noema Worker deployment failed: ${message}\n`);
  process.exitCode = 1;
});
