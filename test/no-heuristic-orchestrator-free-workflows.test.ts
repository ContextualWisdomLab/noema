import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function jobSlice(workflow: string, job: string, nextJob?: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  if (start < 0) throw new Error(`missing workflow job ${job}`);
  if (!nextJob) return workflow.slice(start);
  const end = workflow.indexOf(`  ${nextJob}:`, start + 1);
  if (end < 0) throw new Error(`missing workflow job ${nextJob}`);
  return workflow.slice(start, end);
}

describe("Noema no-heuristics orchestrator contract", () => {
  it("pins every GitHub Actions LLM path to orchestrator/free", () => {
    const gateway = source("scripts/lib/orchestrator-gateway.mjs");
    const review = source(".github/workflows/central-review.yml");
    const hourly = source(".github/workflows/hourly-product-development.yml");

    expect(gateway).toContain('const DEFAULT_ROUTING_ALIAS = "orchestrator/free";');
    expect(review).toContain("NOEMA_LLM_MODEL: orchestrator/free");
    expect(hourly).toContain("NOEMA_LLM_MODEL: orchestrator/free");
    expect(review).not.toContain("NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}");
    expect(hourly).not.toContain("NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}");
  });

  it("does not allocate model attempts with repository-authored timeout or retry counts", () => {
    const gateway = source("scripts/lib/orchestrator-gateway.mjs");
    const review = source(".github/workflows/central-review.yml");
    const hourly = source(".github/workflows/hourly-product-development.yml");
    const config = source("reviewer/noema_reviewer/config.py");
    const agent = source("reviewer/noema_reviewer/agent.py");
    const publish = jobSlice(review, "publish_review");
    const proposer = jobSlice(hourly, "propose_product_increment", "package_product_increment");

    expect(gateway).not.toContain("HEALTH_TIMEOUT_MS");
    expect(publish).not.toContain("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS");
    expect(publish).not.toContain("NOEMA_LLM_MAX_RETRIES");
    expect(publish).not.toContain("timeout-minutes:");
    expect(proposer).not.toContain("OPENCODE_RUN_TIMEOUT_SECONDS");
    expect(proposer).not.toContain("OPENCODE_KILL_GRACE_SECONDS");
    expect(proposer).not.toContain("timeout --kill-after");
    expect(proposer).not.toContain("timeout-minutes:");
    expect(config).not.toContain("request_timeout_seconds");
    expect(config).not.toContain("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS");
    expect(config).not.toContain("NOEMA_LLM_MAX_RETRIES");
    expect(agent).toContain("retries=0");
    expect(agent).not.toContain("retries=3");
  });

  it("derives private-target ZDR from live repository visibility and never from a caller override", () => {
    const review = source(".github/workflows/central-review.yml");
    const hourly = source(".github/workflows/hourly-product-development.yml");
    const agent = source("reviewer/noema_reviewer/agent.py");

    expect(review).toContain('gh api "repos/${TARGET_REPOSITORY}" --jq .visibility');
    expect(review).toContain("NOEMA_LLM_ZDR_ONLY=true");
    expect(hourly).toContain('gh api "repos/${GITHUB_REPOSITORY}" --jq .visibility');
    expect(hourly).toContain("NOEMA_LLM_ZDR_ONLY=true");
    expect(review).not.toContain("vars.NOEMA_LLM_ZDR_ONLY");
    expect(hourly).not.toContain("vars.NOEMA_LLM_ZDR_ONLY");
    expect(agent).toContain('"extra_body": {"zdr_only": True}');
  });

  it("does not use a locally selected severity cutoff or uncalibrated confidence estimate as review authority", () => {
    const models = source("reviewer/noema_reviewer/models.py");
    const gating = source("reviewer/noema_reviewer/gating.py");
    const review = source(".github/workflows/central-review.yml");

    expect(models).not.toContain("BLOCKING_SEVERITIES");
    expect(models).not.toContain("class Confidence");
    expect(models).not.toContain("confidence:");
    expect(gating).not.toContain("MEDIUM-or-higher");
    expect(review).not.toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(review).not.toContain("confidence}'");
  });
});
