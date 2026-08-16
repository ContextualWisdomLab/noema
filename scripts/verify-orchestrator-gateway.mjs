#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  serializeOrchestratorGatewayConsumerContract,
  verifyOrchestratorGatewayContract,
} from "./lib/orchestrator-gateway.mjs";

/**
 * Parse `--print-contract` and the optional `--write-opencode-config PATH` flag.
 *
 * @param {string[]} argv Process arguments after the script name.
 * @returns {{ openCodeConfigPath: string, printContract: boolean }} Parsed CLI options.
 * @throws {Error} When the flag is present without a path or is unknown.
 */
export function parseVerifyOrchestratorGatewayArgs(argv) {
  const args = [...argv];
  let openCodeConfigPath = "";
  let printContract = false;
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--print-contract") {
      printContract = true;
      continue;
    }
    if (flag === "--write-opencode-config") {
      const path = args.shift();
      if (!path) {
        throw new Error("--write-opencode-config requires a destination path");
      }
      openCodeConfigPath = path;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }
  return { openCodeConfigPath, printContract };
}

/**
 * Run the production gateway preflight using CI secret transport only.
 *
 * @param {object} input
 * @param {string[]} input.argv
 * @param {NodeJS.ProcessEnv} input.env
 * @param {typeof fetch} [input.fetchImpl]
 * @param {(message: string) => void} input.writeStdout
 * @param {(message: string) => void} input.writeStderr
 * @returns {Promise<number>} Process exit code.
 */
export async function runVerifyOrchestratorGatewayCli(input) {
  try {
    const options = parseVerifyOrchestratorGatewayArgs(input.argv);
    if (options.printContract) {
      input.writeStdout(serializeOrchestratorGatewayConsumerContract());
      return 0;
    }
    const verified = await verifyOrchestratorGatewayContract({
      env: input.env,
      fetchImpl: input.fetchImpl,
      openCodeConfigPath: options.openCodeConfigPath,
    });
    input.writeStdout("Verified contextual-orchestrator gateway identity.\n");
    input.writeStdout(
      `Noema provider contract: gateway=contextual-orchestrator primary=${verified.model}.\n`,
    );
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.writeStderr(`::error::Noema contextual-orchestrator preflight failed: ${message}\n`);
    return 1;
  }
}

/**
 * Write one CLI success line to stdout.
 *
 * @param {string} message Diagnostic text.
 * @returns {void}
 */
export function writeVerifyOrchestratorGatewayStdout(message) {
  process.stdout.write(message);
}

/**
 * Write one CLI failure line to stderr.
 *
 * @param {string} message Diagnostic text.
 * @returns {void}
 */
export function writeVerifyOrchestratorGatewayStderr(message) {
  process.stderr.write(message);
}

/**
 * Resolve the file URL of the process entrypoint, if any.
 *
 * @param {string | undefined} argv1 `process.argv[1]`.
 * @returns {string} File URL, or an empty string when argv[1] is absent.
 */
export function resolveVerifyOrchestratorGatewayInvokedHref(argv1) {
  return argv1 ? pathToFileURL(resolve(argv1)).href : "";
}

/**
 * Bind the process argv/env/stdio into the injectable CLI runner.
 *
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch }} [processLike]
 * @returns {() => Promise<number>} CLI operation used by the module entrypoint.
 */
export function createVerifyOrchestratorGatewayProcessCli(processLike = process) {
  return () => runVerifyOrchestratorGatewayCli({
    argv: (processLike.argv ?? []).slice(2),
    env: processLike.env ?? {},
    fetchImpl: processLike.fetchImpl,
    writeStdout: writeVerifyOrchestratorGatewayStdout,
    writeStderr: writeVerifyOrchestratorGatewayStderr,
  });
}

/**
 * Execute the CLI only for a direct module invocation.
 *
 * @param {boolean} invoked Whether this file is the Node entrypoint.
 * @param {() => Promise<number>} cli Trusted CLI operation.
 * @returns {Promise<void>}
 */
export async function runVerifyOrchestratorGatewayEntrypoint(invoked, cli) {
  if (!invoked) return;
  process.exitCode = await cli();
}

const invokedPath = resolveVerifyOrchestratorGatewayInvokedHref(process.argv[1]);

await runVerifyOrchestratorGatewayEntrypoint(
  invokedPath === import.meta.url,
  createVerifyOrchestratorGatewayProcessCli(),
);
