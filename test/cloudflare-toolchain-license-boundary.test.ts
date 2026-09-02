import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")) as Record<string, unknown>;
}

describe("Cloudflare Worker toolchain license boundary", () => {
  it("keeps Wrangler, Miniflare, Sharp, and libvips out of the committed dependency graph", () => {
    const pkg = readJson("../package.json") as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const lockText = readFileSync(new URL("../package-lock.json", import.meta.url), "utf8");

    expect(pkg.devDependencies?.wrangler).toBeUndefined();
    expect(pkg.devDependencies?.esbuild).toBe("0.28.1");
    expect(pkg.devDependencies?.workerd).toBe("1.20260625.1");
    expect(pkg.scripts?.deploy).toBe("node scripts/cloudflare-worker-deploy.mjs");
    expect(pkg.scripts?.dev).toBe("node scripts/cloudflare-worker-dev.mjs");

    for (const forbidden of [
      '"node_modules/wrangler"',
      '"node_modules/miniflare"',
      '"node_modules/sharp"',
      '"node_modules/@img/sharp-libvips-',
      '"LGPL-3.0',
      '"GPL-3.0',
      '"AGPL-3.0',
    ]) {
      expect(lockText).not.toContain(forbidden);
    }
  });

  it("uses a direct Cloudflare API deployment boundary with immutable source annotations", () => {
    const deploy = readFileSync(
      new URL("../scripts/cloudflare-worker-deploy.mjs", import.meta.url),
      "utf8",
    );

    expect(deploy).toContain("/workers/scripts/${encodeURIComponent(scriptName)}/versions");
    expect(deploy).toContain('type: "durable_object_namespace"');
    expect(deploy).toContain('"workers/commit_sha"');
    expect(deploy).toContain("CLOUDFLARE_API_TOKEN");
    expect(deploy).not.toContain("wrangler");
    expect(deploy).not.toContain("miniflare");
  });

  it("runs local development on pinned workerd with local-only Durable Object storage", () => {
    const dev = readFileSync(
      new URL("../scripts/cloudflare-worker-dev.mjs", import.meta.url),
      "utf8",
    );

    expect(dev).toContain("workerd serve");
    expect(dev).toContain("durableObjectNamespaces");
    expect(dev).toContain("localDisk");
    expect(dev).toContain('address = "127.0.0.1:8787"');
    expect(dev).not.toContain("wrangler");
    expect(dev).not.toContain("miniflare");
  });
});
