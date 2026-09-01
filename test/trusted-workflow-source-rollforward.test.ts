import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "83ae03f67ebaef5ac2840fb9b7c3bffc72e20508";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });
});
