import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "17052a7ca3c16db90932a4d6036b43165ddee418";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });
});
