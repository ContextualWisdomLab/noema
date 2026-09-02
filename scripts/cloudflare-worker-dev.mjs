#!/usr/bin/env node
import { spawn } from "node:child_process";
import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { readNoemaWorkerConfig } from "./lib/cloudflare-worker-config.mjs";

const REQUIRED_LOCAL_SECRETS = ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY_PEM"];
const OPTIONAL_LOCAL_SECRETS = ["GITHUB_APP_INSTALLATION_ID"];
const workerdCommand = "workerd serve";

function capnpText(value) {
  return JSON.stringify(String(value));
}

function requireLocalSecrets() {
  for (const name of REQUIRED_LOCAL_SECRETS) {
    if (!process.env[name]) throw new Error(`Missing required local Worker binding: ${name}`);
  }
}

function bindingLines(config) {
  const lines = [];
  for (const [name, value] of Object.entries(config.vars)) {
    lines.push(`    (name = ${capnpText(name)}, text = ${capnpText(value)})`);
  }
  for (const { name, class_name } of config.durableObjects) {
    lines.push(
      `    (name = ${capnpText(name)}, durableObjectNamespace = ${capnpText(class_name)})`,
    );
  }
  for (const name of REQUIRED_LOCAL_SECRETS) {
    lines.push(`    (name = ${capnpText(name)}, fromEnvironment = ${capnpText(name)})`);
  }
  for (const name of OPTIONAL_LOCAL_SECRETS) {
    if (process.env[name]) {
      lines.push(`    (name = ${capnpText(name)}, fromEnvironment = ${capnpText(name)})`);
    }
  }
  return lines.join(",\n");
}

function durableObjectNamespaceLines(config) {
  return config.durableObjects.map(({ class_name }, index) => [
    "    (",
    `      className = ${capnpText(class_name)},`,
    `      uniqueKey = ${capnpText(`noema-local-${index + 1}-${class_name}`)},`,
    "      enableSql = true",
    "    )",
  ].join("\n")).join(",\n");
}

function workerdConfig(config, storageDirectory) {
  return `using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "main", worker = .mainWorker),
    (name = "do-storage", disk = (path = ${capnpText(storageDirectory)}, writable = true)),
    (name = "internet", network = (allow = ["public"], tlsOptions = (trustBrowserCas = true)))
  ],
  sockets = [
    (
      name = "http",
      address = "127.0.0.1:8787",
      http = (),
      service = "main"
    )
  ]
);

const mainWorker :Workerd.Worker = (
  modules = [(name = "worker.mjs", esModule = embed "worker.mjs")],
  compatibilityDate = ${capnpText(config.compatibilityDate)},
  bindings = [
${bindingLines(config)}
  ],
  durableObjectNamespaces = [
${durableObjectNamespaceLines(config)}
  ],
  durableObjectStorage = (localDisk = "do-storage")
);
`;
}

async function bundleWorker(repositoryRoot, config, outputFile) {
  await build({
    absWorkingDir: repositoryRoot,
    entryPoints: [config.main],
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

async function runWorkerd(executable, configPath, repositoryRoot) {
  const child = spawn(executable, ["serve", configPath], {
    cwd: repositoryRoot,
    env: process.env,
    stdio: "inherit",
  });
  const forwardSignal = (signal) => {
    if (!child.killed) child.kill(signal);
  };
  process.once("SIGINT", forwardSignal);
  process.once("SIGTERM", forwardSignal);
  try {
    return await new Promise((resolvePromise, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        if (signal) reject(new Error(`${workerdCommand} exited from signal ${signal}`));
        else resolvePromise(code ?? 1);
      });
    });
  } finally {
    process.removeListener("SIGINT", forwardSignal);
    process.removeListener("SIGTERM", forwardSignal);
  }
}

async function main() {
  const repositoryRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
  const config = await readNoemaWorkerConfig(repositoryRoot);
  requireLocalSecrets();

  const executable = join(
    repositoryRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "workerd.cmd" : "workerd",
  );
  await access(executable);

  const storageDirectory = join(repositoryRoot, ".noema-dev", "durable-objects");
  await mkdir(storageDirectory, { recursive: true });
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "noema-worker-dev-"));
  const outputFile = join(temporaryDirectory, "worker.mjs");
  const configPath = join(temporaryDirectory, "config.capnp");

  try {
    await bundleWorker(repositoryRoot, config, outputFile);
    await writeFile(configPath, workerdConfig(config, storageDirectory), { mode: 0o600 });
    const exitCode = await runWorkerd(executable, configPath, repositoryRoot);
    if (exitCode !== 0) throw new Error(`${workerdCommand} exited with code ${exitCode}`);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Noema local Worker failed: ${message}\n`);
  process.exitCode = 1;
});
