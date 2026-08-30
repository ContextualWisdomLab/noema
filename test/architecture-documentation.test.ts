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

  it("binds the code-current architecture to Wrangler state classes and immutable workflow-source configuration", () => {
    const wrangler = readFileSync("wrangler.toml", "utf8");
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");

    expect(wrangler).toContain('main = "src/runtime-entrypoint.ts"');
    expect(wrangler).toContain('name = "NOEMA_RATE_LIMITER"');
    expect(wrangler).toContain('class_name = "NoemaRateLimiter"');
    expect(wrangler).toContain('name = "NOEMA_OIDC_REPLAY_GUARD"');
    expect(wrangler).toContain('class_name = "NoemaOidcReplayGuard"');

    const workflowSha = wrangler.match(/ALLOWED_WORKFLOW_SHA = "([0-9a-f]{40})"/)?.[1];
    expect(workflowSha).toBeDefined();
    expect(architecture).toContain("Code-current canonical architecture");
    expect(architecture).toContain("`ALLOWED_WORKFLOW_SHA`");
    expect(architecture).toContain(workflowSha!);
    expect(architecture).not.toContain("Active PR #426");
    expect(architecture).not.toContain("not deployed truth until the PR integrates");
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

  it("documents exact-ref workflow trust plus immutable workflow-source binding without restoring an unauthenticated runtime SHA prefilter", () => {
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    const runtimeEntrypoint = readFileSync("src/runtime-entrypoint.ts", "utf8");
    const worker = readFileSync("src/worker.ts", "utf8");
    const coreWorker = readFileSync("src/index.ts", "utf8");

    expect(worker).toContain("configuredExactWorkflowRef");
    expect(worker).toContain("workflowRef !== configuredRef");
    expect(worker).not.toContain("workflow_sha");
    expect(worker).not.toContain("job_workflow_sha");
    expect(runtimeEntrypoint).toContain("ALLOWED_WORKFLOW_SHA");
    expect(runtimeEntrypoint).not.toContain("workflowSourceDecision");
    expect(coreWorker).toContain("job_workflow_sha");
    expect(coreWorker).toContain("workflow_sha");
    expect(architecture).toContain("exact full workflow ref");
    expect(architecture).toContain("immutable workflow-source SHA");
    expect(architecture).toContain("operator authority bytes");
    expect(architecture).toContain("distributed rate limiting before unverified workflow-source claims");
  });

  it("keeps the canonical documentation audit aligned with integrated buyer/operator documentation", () => {
    const index = readFileSync("docs/README.md", "utf8");
    const gapAudit = readFileSync("docs/DOCUMENTATION_GAP_AUDIT.md", "utf8");

    expect(index).toContain("[Architecture](../ARCHITECTURE.md)");
    expect(gapAudit).toContain("customer-facing root README plus contributor/agent procedure relocation are protected-main truth");
    expect(gapAudit).toContain("readiness/operator documentation");
    expect(gapAudit).toContain("protected-main truth");
    expect(gapAudit).not.toContain("PR #413 integrated on protected main");
    expect(gapAudit).not.toContain("PR #415 integrated on protected main");
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
