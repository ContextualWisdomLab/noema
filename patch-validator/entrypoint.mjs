import { runCli } from "./runtime.mjs";

export function buildFailureDiagnostic(result) {
  return {
    trusted: false,
    status: result.status,
    exit_code: result.exit_code,
    stderr_excerpt: result.stderr_excerpt,
    reason_codes: [...result.reason_codes],
  };
}

export function runEntrypoint({ runCliImpl, writeDiagnostic }) {
  const result = runCliImpl();
  if (result.status === "passed") {
    return 0;
  }
  writeDiagnostic(`${JSON.stringify(buildFailureDiagnostic(result))}\n`);
  return result.exit_code || 1;
}

export function runImageEntrypoint() {
  return runEntrypoint({
    runCliImpl: runCli,
    writeDiagnostic: (message) => process.stderr.write(message),
  });
}
