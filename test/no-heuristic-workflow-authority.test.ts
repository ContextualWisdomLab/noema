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

  it("derives central-review request privacy from live target visibility", () => {
    const review = source(".github/workflows/central-review.yml");

    expect(review).toContain('gh api "repos/${TARGET_REPOSITORY}" --jq .visibility');
    expect(review).toContain("NOEMA_LLM_ZDR_ONLY=true");
  });

  it("fails hourly OpenCode routing closed for non-public repository visibility", () => {
    // The PydanticAI reviewer (central-review.yml) supports a request-level
    // zdr_only transport, so it derives a NOEMA_LLM_ZDR_ONLY flag from live
    // visibility. OpenCode (hourly-product-development.yml) has no proved
    // zdr_only transport, so it must refuse to run at all for a non-public
    // repository instead of toggling a flag nothing downstream enforces; see
    // requirePublicRepositoryForOpenCode in scripts/verify-orchestrator-gateway.mjs.
    const hourly = source(".github/workflows/hourly-product-development.yml");
    const gateway = source("scripts/verify-orchestrator-gateway.mjs");

    expect(hourly).toContain("--write-opencode-config");
    expect(gateway).toContain("requirePublicRepositoryForOpenCode(input.env?.GITHUB_EVENT_PATH)");
    expect(gateway).toContain("OpenCode inference fails closed for");
  });

  it("does not publish uncalibrated confidence from the central review job", () => {
    const review = source(".github/workflows/central-review.yml");
    const publish = jobSlice(review, "publish_review");

    expect(publish).not.toContain("findings,blocked_reasons,confidence");
  });

  it("does not invent a default contextual-orchestrator health deadline", () => {
    const gateway = source("scripts/lib/orchestrator-gateway.mjs");

    expect(gateway).not.toContain("HEALTH_TIMEOUT_MS");
    expect(gateway).toContain("const timeoutMs = options.timeoutMs;");
  });
});
