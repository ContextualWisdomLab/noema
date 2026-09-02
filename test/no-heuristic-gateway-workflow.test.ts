import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readJobSlice } from "./helpers/hourly-workflow";

const FREE_POOL = "orchestrator/free";

describe("Noema gateway workflows have no local inference routing policy", () => {
  it("pins central review to orchestrator/free without reviewer timeout or retry knobs", () => {
    const workflow = readFileSync(".github/workflows/central-review.yml", "utf8");
    const publication = readJobSlice(workflow, "publish_review");

    expect(publication).toContain(`NOEMA_LLM_MODEL: ${FREE_POOL}`);
    expect(publication).not.toContain("vars.NOEMA_LLM_MODEL");
    expect(publication).not.toContain("NOEMA_LLM_REQUEST_TIMEOUT_SECONDS");
    expect(publication).not.toContain("NOEMA_LLM_MAX_RETRIES");
    expect(publication).not.toContain("timeout-minutes:");
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
