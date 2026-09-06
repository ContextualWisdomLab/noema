import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSha =
  "49eb9e7035a6994fffb5b24bf943156be27a02fb";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSha}"`,
    );
  });

  it("keeps the mutable exact source pin single-sourced in wrangler configuration", () => {
    const architecture = readFileSync(new URL("../ARCHITECTURE.md", import.meta.url), "utf8");

    expect(architecture).toContain(
      "`wrangler.toml` is the canonical repository copy of the currently audited `ALLOWED_WORKFLOW_SHA`",
    );
    expect(architecture).not.toContain(auditedCentralWorkflowSha);
  });
});