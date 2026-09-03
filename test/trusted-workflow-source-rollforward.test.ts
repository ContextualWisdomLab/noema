import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "51b812d181989ed28366b5850d1a34f51df10187";

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