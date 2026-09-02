import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

function jobSlice(workflow: string, job: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  if (start < 0) throw new Error(`missing workflow job ${job}`);
  return workflow.slice(start);
}

describe("Noema delegates model policy to contextual-orchestrator", () => {
  it("keeps central review on the exact free pool without local attempt allocation", () => {
    const review = source(".github/workflows/central-review.yml");
    const publish = jobSlice(review, "publish_review");

    expect(publish).toContain("NOEMA_LLM_MODEL: orchestrator/free");
    expect(publish).not.toContain("NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}");
    expect(publish).not.toContain("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS");
    expect(publish).not.toContain("NOEMA_LLM_MAX_RETRIES");
  });

  it("derives request privacy from live repository visibility", () => {
    const review = source(".github/workflows/central-review.yml");
    const hourly = source(".github/workflows/hourly-product-development.yml");

    expect(review).toContain('gh api "repos/${TARGET_REPOSITORY}" --jq .visibility');
    expect(review).toContain("NOEMA_LLM_ZDR_ONLY=true");
    expect(hourly).toContain('gh api "repos/${GITHUB_REPOSITORY}" --jq .visibility');
    expect(hourly).toContain("NOEMA_LLM_ZDR_ONLY=true");
    expect(hourly).toContain("private-repository inference fails closed");
  });

  it("does not turn scanner severity or uncalibrated confidence into review authority", () => {
    const review = source(".github/workflows/central-review.yml");

    expect(review).not.toContain("--severity MEDIUM,HIGH,CRITICAL");
    expect(review).not.toContain("findings,blocked_reasons,confidence");
  });

  it("does not invent a default contextual-orchestrator health deadline", () => {
    const gateway = source("scripts/lib/orchestrator-gateway.mjs");

    expect(gateway).not.toContain("HEALTH_TIMEOUT_MS");
    expect(gateway).toContain("const timeoutMs = options.timeoutMs;");
  });
});
