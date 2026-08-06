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

const TYPESCRIPT_MODULE = "/opt/noema/node_modules/typescript/bin/tsc";
const VITEST_MODULE = "/opt/noema/node_modules/vitest/vitest.mjs";
const TRUSTED_TYPESCRIPT_CONFIG = "/opt/noema/validator-tsconfig.json";
const TRUSTED_VITEST_CONFIG = "/opt/noema/validator-vitest.config.mjs";

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

function imageOwnedValidationArguments(argumentsList, options) {
  const modulePath = argumentsList[0];
  if (modulePath === TYPESCRIPT_MODULE) {
    return [
      modulePath,
      "--noEmit",
      "--project",
      TRUSTED_TYPESCRIPT_CONFIG,
    ];
  }
  if (modulePath === VITEST_MODULE) {
    return [
      modulePath,
      "run",
      "--coverage",
      "--root",
      options.cwd,
      "--configLoader",
      "runner",
      "--config",
      TRUSTED_VITEST_CONFIG,
    ];
  }
  return addRunnerConfigLoader(argumentsList);
}

function isolateReadOnlyViteConfiguration(spawnSyncImpl) {
  return (command, argumentsList, options) =>
    spawnSyncImpl(
      command,
      imageOwnedValidationArguments(argumentsList, options),
      options,
    );
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
