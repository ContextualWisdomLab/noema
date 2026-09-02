import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readJobSlice } from "./helpers/hourly-workflow";

const FREE_POOL = "orchestrator/free";

describe("Noema gateway workflows have no local provider-routing authority", () => {
  it("validates central review routing before the credential-bearing reviewer", () => {
    const workflow = readFileSync(".github/workflows/central-review.yml", "utf8");
    const publication = readJobSlice(workflow, "publish_review");
    const preflight = "node scripts/verify-orchestrator-gateway.mjs";
    const reviewer = "python -m noema_reviewer";

    expect(publication).toContain("NOEMA_LLM_MODEL: ${{ vars.NOEMA_LLM_MODEL }}");
    expect(publication).toContain(preflight);
    expect(publication).toContain(reviewer);
    expect(publication.indexOf(preflight)).toBeLessThan(
      publication.indexOf(reviewer),
    );
    expect(publication).not.toContain("NOEMA_FALLBACK_LLM_MODEL");
    expect(publication).not.toContain("NOEMA_FALLBACK_LLM_API_URL");
    expect(publication).not.toContain("NOEMA_FALLBACK_LLM_API_KEY");
  });

  it("does not cap the OpenCode inference session with a repository-authored wall clock", () => {
    const workflow = readFileSync(
      ".github/workflows/hourly-product-development.yml",
      "utf8",
    );
    const proposer = readJobSlice(
      workflow,
      "propose_product_increment",
      "package_product_increment",
    );

    expect(proposer).toContain(`NOEMA_LLM_MODEL: ${FREE_POOL}`);
    expect(proposer).not.toContain("vars.NOEMA_LLM_MODEL");
    expect(proposer).not.toContain("OPENCODE_RUN_TIMEOUT_SECONDS");
    expect(proposer).not.toContain("OPENCODE_KILL_GRACE_SECONDS");
    expect(proposer).not.toContain("timeout --kill-after");
    expect(proposer).not.toContain("timeout-minutes:");
    expect(proposer).toContain('opencode run "$prompt" --agent build');
  });
});
