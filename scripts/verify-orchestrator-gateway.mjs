#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  defaultOrchestratorModel,
  parseOrchestratorGatewayUrl,
  resolveOrchestratorModel,
  serializeOrchestratorGatewayConsumerContract,
  verifyOrchestratorHealthz,
  writeOpenCodeOrchestratorConfig,
} from "./lib/orchestrator-gateway.mjs";

const LEGACY_GATEWAY_SERVICE_ALIAS = "contextual-orchestrator";

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
 * Read the repository visibility carried by the immutable GitHub event payload.
 *
 * OpenCode currently writes a generic OpenAI-compatible configuration and has no
 * proved request-body `zdr_only` transport. Therefore its credential-bearing
 * inference path is authorized only for a public repository. Missing, malformed,
 * private, or internal visibility fails closed before the gateway health request
 * or OpenCode configuration is emitted.
 *
 * @param {string | undefined} eventPath GitHub's current event payload path.
 * @returns {string} Canonical repository visibility.
 * @throws {Error} When authoritative visibility is unavailable.
 */
export function readGitHubRepositoryVisibility(eventPath) {
  const path = String(eventPath ?? "").trim();
  if (!path) {
    throw new Error("OpenCode routing requires GITHUB_EVENT_PATH repository visibility");
  }
  let payload;
  try {
    payload = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    throw new Error("OpenCode routing could not read authoritative repository visibility");
  }
  const visibility = String(payload?.repository?.visibility ?? "").trim().toLowerCase();
  if (!new Set(["public", "private", "internal"]).has(visibility)) {
    throw new Error("OpenCode routing received unsupported repository visibility");
  }
  return visibility;
}

/**
 * Enforce the current OpenCode privacy authority before any gateway/model I/O.
 *
 * @param {string | undefined} eventPath GitHub event payload path.
 * @returns {void}
 * @throws {Error} For every non-public or unknown repository visibility.
 */
export function requirePublicRepositoryForOpenCode(eventPath) {
  const visibility = readGitHubRepositoryVisibility(eventPath);
  if (visibility !== "public") {
    throw new Error(
      `OpenCode inference fails closed for ${visibility} repositories until request-level zdr_only is proved`,
    );
  }
}

/**
 * Run the secret-free gateway identity preflight.
 *
 * The preflight validates only non-secret transport configuration and the
 * unauthenticated `/healthz` identity. It deliberately never reads
 * `NOEMA_LLM_API_KEY`; the downstream OpenCode or reviewer process is the only
 * consumer of that dedicated inference credential. The legacy service-name
 * setting is accepted only at this process/configuration boundary and is
 * normalized to the canonical free-pool alias before any request is built.
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

    if (options.openCodeConfigPath) {
      requirePublicRepositoryForOpenCode(input.env?.GITHUB_EVENT_PATH);
    }

    const configuredModel = String(input.env?.NOEMA_LLM_MODEL ?? "").trim();
    const routingAlias = defaultOrchestratorModel();
    const effectiveModel = configuredModel === LEGACY_GATEWAY_SERVICE_ALIAS
      ? routingAlias
      : configuredModel;
    const model = resolveOrchestratorModel(effectiveModel);
    const gateway = parseOrchestratorGatewayUrl(
      String(input.env?.NOEMA_LLM_API_URL ?? "").trim(),
    );
    await verifyOrchestratorHealthz(gateway.healthzUrl, {
      fetchImpl: input.fetchImpl,
    });
    if (options.openCodeConfigPath) {
      writeOpenCodeOrchestratorConfig(options.openCodeConfigPath, {
        apiUrl: gateway.href,
        model,
      });
    }

    input.writeStdout("Verified contextual-orchestrator gateway identity.\n");
    input.writeStdout(
      `Noema provider contract: gateway=contextual-orchestrator primary=${model}.\n`,
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
 * Bind only non-secret process configuration into the injectable CLI runner.
 *
 * The process may carry `NOEMA_LLM_API_KEY` for a later credential-consuming
 * program in the same workflow step. This adapter intentionally copies only
 * non-secret gateway configuration and GitHub's immutable event-file path, so
 * the preflight cannot observe or forward the inference secret while still
 * enforcing repository visibility before OpenCode config creation.
 *
 * @param {{ argv?: string[], env?: NodeJS.ProcessEnv, fetchImpl?: typeof fetch, writeStdout?: (message: string) => void, writeStderr?: (message: string) => void }} [processLike]
 * @returns {() => Promise<number>} CLI operation used by the module entrypoint.
 */
export function createVerifyOrchestratorGatewayProcessCli(processLike = process) {
  const processEnv = processLike.env ?? {};
  const preflightEnv = {
    NOEMA_LLM_API_URL: processEnv.NOEMA_LLM_API_URL,
    NOEMA_LLM_MODEL: processEnv.NOEMA_LLM_MODEL,
    GITHUB_EVENT_PATH: processEnv.GITHUB_EVENT_PATH,
  };
  return () => runVerifyOrchestratorGatewayCli({
    argv: (processLike.argv ?? []).slice(2),
    env: preflightEnv,
    fetchImpl: processLike.fetchImpl,
    writeStdout: processLike.writeStdout ?? writeVerifyOrchestratorGatewayStdout,
    writeStderr: processLike.writeStderr ?? writeVerifyOrchestratorGatewayStderr,
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
