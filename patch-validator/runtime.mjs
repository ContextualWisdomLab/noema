import { spawnSync } from "node:child_process";

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

export function runValidationCommands(workspaceRoot, options = {}) {
  const { spawnSyncImpl = spawnSync, ...commandOptions } = options;
  return runCoreValidationCommands(workspaceRoot, {
    ...commandOptions,
    spawnSyncImpl: isolateReadOnlyViteConfiguration(spawnSyncImpl),
  });
}

export function runCli(options = {}) {
  const { spawnSyncImpl = spawnSync, ...runtimeOptions } = options;
  return runCoreCli({
    ...runtimeOptions,
    spawnSyncImpl: isolateReadOnlyViteConfiguration(spawnSyncImpl),
  });
}
