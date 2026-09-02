import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const auditedCentralWorkflowSourceSha =
  "b4eec000d21084accb736d289eb64cfd78e7a91a";

describe("trusted central workflow source revision", () => {
  it("binds the deployed OIDC trust configuration to the audited central source commit", () => {
    const wrangler = readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8");

    expect(wrangler).toContain(
      `ALLOWED_WORKFLOW_SHA = "${auditedCentralWorkflowSourceSha}"`,
    );
  });

  it("records the currently audited trust movement in release notes", () => {
    const changelog = readFileSync(new URL("../CHANGELOG.md", import.meta.url), "utf8");

    expect(changelog).toContain(auditedCentralWorkflowSourceSha);
  });
});
