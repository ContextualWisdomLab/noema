import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production Cloudflare deployment toolchain", () => {
  it("keeps CD on the repository-owned direct API path without Wrangler runtime drift", () => {
    const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const workflow = readFileSync(".github/workflows/cd.yml", "utf8");
    const deploy = readFileSync("scripts/cloudflare-worker-deploy.mjs", "utf8");
    const status = readFileSync("scripts/cloudflare-worker-status.mjs", "utf8");
    const evidence = readFileSync("scripts/deployment-evidence.mjs", "utf8");

    expect(packageJson.scripts?.deploy).toBe("node scripts/cloudflare-worker-deploy.mjs");
    expect(packageJson.scripts?.["cloudflare:status"]).toBe("node scripts/cloudflare-worker-status.mjs");

    expect(workflow).not.toContain("npx wrangler");
    expect(workflow).not.toContain("WRANGLER_OUTPUT_FILE_PATH");
    expect(workflow).not.toContain("--wrangler-output");
    expect(workflow).toContain("npm run cloudflare:status >deployment-status-before.json");
    expect(workflow).toContain("npm run deploy >deployment-result.json");
    expect(workflow).toContain("npm run cloudflare:status >deployment-status-after.json");
    expect(workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(workflow).toContain("--deploy-output deployment-result.json");

    expect(deploy).toContain("source_sha: sourceSha");
    expect(deploy).toContain("version_id: versionId");
    expect(deploy).toContain("deployment_id: deploymentId");
    expect(status).toContain("/workers/scripts/${encodedScript}/deployments");
    expect(status).toContain("CLOUDFLARE_API_TOKEN");
    expect(evidence).toContain('"--deploy-output"');
    expect(evidence).not.toContain('"--wrangler-output"');
  });
});
