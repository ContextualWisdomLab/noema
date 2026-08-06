import { O_CREAT, O_EXCL, O_WRONLY } from "node:constants";
import { spawnSync } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
} from "node:fs";
import { dirname } from "node:path";

import {
  runCli as runCoreCli,
  runValidationCommands as runCoreValidationCommands,
} from "./validate-patch.mjs";

export * from "./validate-patch.mjs";

function addRunnerConfigLoader(argumentsList) {
  const configIndex = argumentsList.indexOf("--config");
  if (configIndex < 0) {
    return argumentsList;
  }
  return [
    ...argumentsList.slice(0, configIndex),
    "--configLoader",
    "runner",
    ...argumentsList.slice(configIndex),
  ];
}

function isolateReadOnlyViteConfiguration(spawnSyncImpl) {
  return (command, argumentsList, options) =>
    spawnSyncImpl(command, addRunnerConfigLoader(argumentsList), options);
}

function ensurePrivateResultFile(resultPath) {
  if (existsSync(resultPath)) {
    return;
  }
  mkdirSync(dirname(resultPath), { recursive: true, mode: 0o700 });
  const descriptor = openSync(resultPath, O_CREAT | O_EXCL | O_WRONLY, 0o600);
  closeSync(descriptor);
}

export function runValidationCommands(workspaceRoot, options = {}) {
  const { spawnSyncImpl = spawnSync, ...commandOptions } = options;
  return runCoreValidationCommands(workspaceRoot, {
    ...commandOptions,
    spawnSyncImpl: isolateReadOnlyViteConfiguration(spawnSyncImpl),
  });
}

export function runCli(options = {}) {
  const { spawnSyncImpl = spawnSync, ...runtimeOptions } = options;
  const environment = runtimeOptions.env ?? process.env;
  const effectiveResultPath = runtimeOptions.resultPath ?? environment.NOEMA_RESULT_PATH;
  if (typeof effectiveResultPath === "string") {
    ensurePrivateResultFile(effectiveResultPath);
  }
  return runCoreCli({
    ...runtimeOptions,
    spawnSyncImpl: isolateReadOnlyViteConfiguration(spawnSyncImpl),
  });
}
