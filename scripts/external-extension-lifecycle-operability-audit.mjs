#!/usr/bin/env node
import { pathToFileURL } from "node:url";
import { evaluateExternalExtensionLifecycleOperabilityEvidence } from "./lib/external-extension-lifecycle-operability-evidence.mjs";
import { readStrictJsonEvidenceWithSha256 } from "./lib/strict-json-evidence.mjs";

const DEFAULT_EVIDENCE_PATH = "external-extension-lifecycle-operability-evidence.json";

function collectionFailure(reason) {
  return {
    status: "FAIL",
    checks: [{ code: "evidence_collection", pass: false }],
    failures: [{
      code: "evidence_collection",
      detail: `lifecycle operability evidence could not be read safely (${reason})`,
    }],
    metrics: {
      read_current_p95_ms: null,
      contended_append_p95_ms: null,
      storage_growth_bytes: null,
    },
  };
}

/** Resolve one explicit evidence path while preserving a deterministic operator default. */
export function resolveEvidencePath(argv) {
  const raw = argv[2];
  if (raw === undefined) return DEFAULT_EVIDENCE_PATH;
  const normalized = String(raw).trim();
  return normalized.length === 0 ? DEFAULT_EVIDENCE_PATH : normalized;
}

/**
 * Evaluate one descriptor-safe retained evidence file and emit only bounded validation results.
 * Raw samples, source evidence, and the caller-supplied evidence pathname are never echoed.
 */
export function main(options = {}) {
  const argv = options.argv ?? process.argv;
  const readEvidence = options.readEvidence ?? readStrictJsonEvidenceWithSha256;
  const writeOutput = options.writeOutput ?? ((value) => process.stdout.write(value));
  const setExitCode = options.setExitCode ?? ((code) => {
    process.exitCode = code;
  });
  const evidencePath = resolveEvidencePath(argv);
  const retained = readEvidence(evidencePath);
  const result = retained.ok
    ? evaluateExternalExtensionLifecycleOperabilityEvidence(retained.value)
    : collectionFailure(retained.reason);

  writeOutput(`${JSON.stringify({
    source: "external-extension-lifecycle-operability-audit",
    evidence_sha256: retained.ok && typeof retained.sha256 === "string" ? retained.sha256 : null,
    ...result,
  })}\n`);
  if (result.status !== "PASS") setExitCode(1);
  return result;
}

/** Execute the CLI only when this module is the process entry point. */
export function runIfDirect(metaUrl, argv, execute) {
  if (!argv[1] || metaUrl !== pathToFileURL(argv[1]).href) return false;
  execute();
  return true;
}

runIfDirect(import.meta.url, process.argv, main);
