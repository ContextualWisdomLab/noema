import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "acbb8e7ceef6d1fc0fee67d553a622ac5d707a9b";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });
});
