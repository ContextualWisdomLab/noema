import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cloudflareControlPlaneClients = [
  "scripts/cloudflare-worker-deploy.mjs",
  "scripts/cloudflare-worker-status.mjs",
  "scripts/cloudflare-worker-recover.mjs",
] as const;

describe("Cloudflare control-plane JSON negotiation", () => {
  it("requests structured JSON responses before applying the bounded JSON reader", () => {
    for (const path of cloudflareControlPlaneClients) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain('accept: "application/json"');
      expect(source).toContain("readBoundedCloudflareJsonResponse");
      expect(source).toContain("AbortSignal.timeout(120_000)");
    }
  });
});
