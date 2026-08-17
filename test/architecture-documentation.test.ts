import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authoritative architecture documentation", () => {
  it("keeps the canonical architecture contract present and aligned with the protected runtime topology", () => {
    expect(existsSync("ARCHITECTURE.md")).toBe(true);

    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    for (const required of [
      "src/runtime-entrypoint.ts",
      "src/entrypoint.ts",
      "src/worker.ts",
      "src/index.ts",
      "/health",
      "/ready",
      "/exchange",
      "NoemaRateLimiter",
      "NoemaOidcReplayGuard",
      "ContextualWisdomLab/.github",
      "naruon",
      "contextual-orchestrator",
      "exact-head",
      "check runs",
      "commit statuses",
      "model judgement",
      "ALLOWED_WORKFLOW_REF_PREFIX",
    ]) {
      expect(architecture).toContain(required);
    }
  });

  it("binds the architecture description to the deployed Wrangler entrypoint and state classes without inventing a removed SHA binding", () => {
    const wrangler = readFileSync("wrangler.toml", "utf8");
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");

    expect(wrangler).toContain('main = "src/runtime-entrypoint.ts"');
    expect(wrangler).toContain('name = "NOEMA_RATE_LIMITER"');
    expect(wrangler).toContain('class_name = "NoemaRateLimiter"');
    expect(wrangler).toContain('name = "NOEMA_OIDC_REPLAY_GUARD"');
    expect(wrangler).toContain('class_name = "NoemaOidcReplayGuard"');
    expect(wrangler).not.toContain("ALLOWED_WORKFLOW_SHA");

    expect(architecture).toContain("NOEMA_RATE_LIMITER");
    expect(architecture).toContain("NOEMA_OIDC_REPLAY_GUARD");
    expect(architecture).toContain("protected runtime does not expose `ALLOWED_WORKFLOW_SHA`");
  });

  it("keeps route claims anchored to their actual implementation layers", () => {
    const runtimeEntrypoint = readFileSync("src/runtime-entrypoint.ts", "utf8");
    const securityEntrypoint = readFileSync("src/entrypoint.ts", "utf8");
    const credentialWorker = readFileSync("src/worker.ts", "utf8");
    const coreWorker = readFileSync("src/index.ts", "utf8");

    expect(runtimeEntrypoint).toContain('from "./entrypoint"');
    expect(runtimeEntrypoint).toContain('url.pathname === "/ready"');
    expect(runtimeEntrypoint).toContain('request.method !== "GET" && request.method !== "HEAD"');

    expect(securityEntrypoint).toContain('from "./worker"');
    expect(securityEntrypoint).toContain('url.pathname === "/exchange"');
    expect(credentialWorker).toContain('url.pathname !== "/exchange"');

    expect(coreWorker).toContain('url.pathname === "/health"');
    expect(coreWorker).toContain('url.pathname === "/exchange"');
    expect(coreWorker).toContain('request.method !== "POST"');
    expect(coreWorker).toContain('status = 404');
    expect(coreWorker).toContain('"Endpoint not found"');
  });

  it("documents current exact-ref workflow trust without reviving historical SHA-claim behavior", () => {
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    const worker = readFileSync("src/worker.ts", "utf8");

    expect(worker).toContain("configuredExactWorkflowRef");
    expect(worker).toContain("workflowRef !== configuredRef");
    expect(worker).not.toContain("workflow_sha");
    expect(worker).not.toContain("job_workflow_sha");
    expect(architecture).toContain("exact full workflow ref");
    expect(architecture).toContain("stronger immutable workflow-source binding");
    expect(architecture).toContain("not implemented on protected main");
  });

  it("keeps the canonical documentation audit aligned with the integrated buyer/operator documentation", () => {
    const index = readFileSync("docs/README.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");

    expect(index).toContain("[Architecture](../ARCHITECTURE.md)");
    expect(gapAudit).toContain("PR #413 integrated on protected main");
    expect(gapAudit).toContain("PR #415 integrated on protected main");
    expect(gapAudit).not.toContain("PR #71 must not race it");
    expect(gapAudit).not.toContain("Separate Draft owner for root README/operator-facing copy");
  });

  it("keeps machine-readable API and coverage maturity bound to protected evidence", () => {
    const index = readFileSync("docs/README.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");

    expect(index).toContain("protected HTTP API machine contract");
    expect(index).toContain("[OpenAPI 3.1](../openapi.json)");
    expect(gapAudit).toContain("source defect itself is no longer an open implementation gap");
    expect(traceability).toContain("broad V8-ignore introduction = regression");
  });
});
