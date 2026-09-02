import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "33db5bf40672f6292e9f0965d977e3b0d293df90";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });
});
