import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("runtime runbook deployment rollback authority", () => {
  it("keeps recovery on the release-bound full Cloudflare traffic authority path", () => {
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
    expect(runbook).toContain("rollback.objective");
    expect(runbook).toContain("rollback.previousDeployment");
    expect(runbook).toContain("restore_exact_pre_deployment_distribution");
    expect(runbook).toContain("versions[0]");
    expect(runbook).toContain("사용하지 않습니다");
    expect(deploymentProvenance).toContain("rollback.previousDeployment");
    expect(deploymentProvenance).toContain("restore_exact_pre_deployment_distribution");
    expect(deploymentProvenance).toContain("previous split is not thereby restored");
  });
});
