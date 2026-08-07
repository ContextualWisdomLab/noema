import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("authoritative architecture documentation", () => {
  it("keeps the root architecture contract present and aligned with the runtime", () => {
    expect(existsSync("ARCHITECTURE.md")).toBe(true);

    const architecture = readFileSync("ARCHITECTURE.md", "utf8");
    for (const required of [
      "src/runtime-entrypoint.ts",
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
      "ALLOWED_WORKFLOW_SHA",
      "workflow_sha",
      "job_workflow_sha",
      "최대 6회",
      "reschedule",
    ]) {
      expect(architecture).toContain(required);
    }
  });

  it("binds the architecture description to the deployed Wrangler entrypoint and state classes", () => {
    const wrangler = readFileSync("wrangler.toml", "utf8");
    const architecture = readFileSync("ARCHITECTURE.md", "utf8");

    expect(wrangler).toContain('main = "src/runtime-entrypoint.ts"');
    expect(wrangler).toContain('name = "NOEMA_RATE_LIMITER"');
    expect(wrangler).toContain('class_name = "NoemaRateLimiter"');
    expect(wrangler).toContain('name = "NOEMA_OIDC_REPLAY_GUARD"');
    expect(wrangler).toContain('class_name = "NoemaOidcReplayGuard"');
    expect(wrangler).toMatch(/ALLOWED_WORKFLOW_SHA = "[0-9a-f]{40}"/);

    expect(architecture).toContain("NOEMA_RATE_LIMITER       → NoemaRateLimiter");
    expect(architecture).toContain("NOEMA_OIDC_REPLAY_GUARD  → NoemaOidcReplayGuard");
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

  it("does not teach agents the superseded single-file runtime model", () => {
    const guidance = readFileSync("CLAUDE.md", "utf8");

    expect(guidance).toContain("src/runtime-entrypoint.ts");
    expect(guidance).toContain("NoemaRateLimiter");
    expect(guidance).toContain("NoemaOidcReplayGuard");
    expect(guidance).toContain("job_workflow_ref");
    expect(guidance).toContain("job_workflow_sha");
    expect(guidance).not.toContain("The entire Worker is one file");
    expect(guidance).not.toContain("There are no KV/D1/queue/Durable Object bindings");
    expect(guidance).not.toContain("The README documents the required NOEMA_* environment variables for each");
  });

  it("keeps operator and API guidance fail-closed for workflow source changes", () => {
    const runbook = readFileSync("docs/runbook.md", "utf8");
    const onboarding = readFileSync("docs/onboarding.md", "utf8");
    const apiSpec = readFileSync("docs/api-spec.md", "utf8");

    for (const document of [runbook, onboarding, apiSpec]) {
      expect(document).toContain("ALLOWED_WORKFLOW_SHA");
      expect(document).toContain("job_workflow_sha");
      expect(document).toContain("workflow_sha");
    }
    expect(runbook).not.toContain("임시적으로 허용 prefix");
    expect(runbook).toContain(
      "wildcard, prefix 확장 또는 SHA 검증 제거는 장애 대응 수단이 아닙니다.",
    );
    expect(apiSpec).toContain("Raw client IP");
    expect(apiSpec).not.toContain('"client_hash"');
  });

  it("separates local readiness misconfiguration from request-token trust failures", () => {
    const runbook = readFileSync("docs/runbook.md", "utf8");
    const onboarding = readFileSync("docs/onboarding.md", "utf8");

    expect(onboarding).toContain(
      "누락되거나 canonical 형식이 아닌 `ALLOWED_WORKFLOW_SHA` binding은 `/ready`에서 503",
    );
    expect(onboarding).toContain(
      "요청 OIDC token의 paired ref/SHA 불일치는 `/exchange`에서 403",
    );
    expect(onboarding).not.toContain(
      "exact workflow SHA가 누락·불일치하면 503",
    );
    expect(runbook).toContain(
      "`outcome=misconfigured`이면 `/ready`의 failed check와 local binding 형식",
    );
    expect(runbook).not.toContain(
      "`ERR_WORKFLOW_NOT_ALLOWED`와 `outcome=misconfigured`",
    );
    expect(runbook).toContain(
      "403 `outcome=blocked`이면 token의 paired ref/SHA와 live workflow source",
    );
  });

  it("makes the architecture contract discoverable from the README", () => {
    const readme = readFileSync("README.md", "utf8");

    expect(readme).toContain("[Architecture & Trust Boundaries](./ARCHITECTURE.md)");
  });
});