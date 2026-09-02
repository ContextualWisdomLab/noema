import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "86ef3e71305daebce2d825c667f7f0619e1f55a5";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });

  it("keeps the mutable exact source pin single-sourced in wrangler configuration", () => {
    const architecture = readFileSync(new URL("../ARCHITECTURE.md", import.meta.url), "utf8");

    expect(architecture).toContain(
      "`wrangler.toml` is the canonical repository copy of the currently audited `ALLOWED_WORKFLOW_SHA`",
    );
    expect(architecture).not.toContain(auditedCentralWorkflowSourceSha);
  });
});
