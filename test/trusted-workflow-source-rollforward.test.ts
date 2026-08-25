import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "95b05b393c75931044b405ae491079d336d89293";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });
});
