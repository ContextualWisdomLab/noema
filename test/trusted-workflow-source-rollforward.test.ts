import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSha =
  "dcd35b7653854edb2ea26a87bac2035f12d8d903";

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