#!/usr/bin/env node
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { verifyOrchestratorGatewayContract } from "./lib/orchestrator-gateway.mjs";

/**
 * Parse the optional `--write-opencode-config PATH` flag.
 *
 * @param {string[]} argv Process arguments after the script name.
 * @returns {{ openCodeConfigPath: string }} Parsed CLI options.
 * @throws {Error} When the flag is present without a path or is unknown.
 */
export function parseVerifyOrchestratorGatewayArgs(argv) {
  const args = [...argv];
  let openCodeConfigPath = "";
  while (args.length > 0) {
    const flag = args.shift();
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
  return { openCodeConfigPath };
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

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";

await runVerifyOrchestratorGatewayEntrypoint(
  invokedPath === import.meta.url,
  () => runVerifyOrchestratorGatewayCli({
    argv: process.argv.slice(2),
    env: process.env,
    writeStdout: (message) => {
      process.stdout.write(message);
    },
    writeStderr: (message) => {
      process.stderr.write(message);
    },
  }),
);
