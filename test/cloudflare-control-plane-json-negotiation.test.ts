import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cloudflareControlPlaneClients = [
  "scripts/cloudflare-worker-deploy.mjs",
  "scripts/cloudflare-worker-status.mjs",
  "scripts/cloudflare-worker-recover.mjs",
] as const;

const sourceRepairExact = "80d3d579ad4a08ccb3f21e2735c7fb0bebc7b492";

describe("Cloudflare control-plane JSON negotiation", () => {
  it("requests structured JSON responses before applying the bounded JSON reader", () => {
    for (const path of cloudflareControlPlaneClients) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('accept: "application/json"');
      expect(source).toContain("readBoundedCloudflareJsonResponse");
      expect(source).toContain("AbortSignal.timeout(120_000)");
    }
  });

  it("keeps canonical product and standards traceability aligned with the source repair", () => {
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const traceability = readFileSync("docs/TRACEABILITY.md", "utf8");
    const baseline = readFileSync("docs/product-technical-gap-baseline.md", "utf8");

    expect(changelog).toContain("PR #701");
    expect(changelog).toContain(sourceRepairExact);
    expect(traceability).toContain("Cloudflare control-plane JSON negotiation");
    expect(traceability).toContain("Cloudflare. (2026, May 5). *Error responses*");
    expect(baseline).toContain(`PR #701 source exact \`${sourceRepairExact}\``);
    expect(baseline).toContain("Cloudflare-generated errors");
  });
});
