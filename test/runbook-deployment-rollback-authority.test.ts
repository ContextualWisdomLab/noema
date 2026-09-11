import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime runbook deployment rollback authority", () => {
  it("keeps rollback on the release-bound Cloudflare deployment evidence path", () => {
    const runbook = readFileSync("docs/runbook.md", "utf8");
    const deploymentProvenance = readFileSync("docs/deployment-provenance.md", "utf8");
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.wrangler).toBeUndefined();
    expect(packageJson.devDependencies?.wrangler).toBeUndefined();
    expect(runbook).not.toContain("wrangler rollback");
    expect(runbook).toContain("docs/deployment-provenance.md");
    expect(runbook).toContain("rollback.previousWorkerVersionId");
    expect(runbook).toContain("Cloudflare");
    expect(deploymentProvenance).toContain("rollback.previousWorkerVersionId");
    expect(deploymentProvenance).toContain("Cloudflare's version deployment/rollback mechanism");
  });
});
