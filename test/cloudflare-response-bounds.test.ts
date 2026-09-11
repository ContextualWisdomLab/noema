import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const cloudflareTransportCallers = [
  "scripts/cloudflare-worker-deploy.mjs",
  "scripts/cloudflare-worker-status.mjs",
  "scripts/cloudflare-worker-recover.mjs",
] as const;

describe("Cloudflare control-plane response bounds", () => {
  it("applies the response byte ceiling while streaming instead of buffering response.text() first", () => {
    for (const path of cloudflareTransportCallers) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("response.text()");
      expect(source).toContain("readBoundedCloudflareJsonResponse");
    }
  });
});
