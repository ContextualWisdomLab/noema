import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  packageManager?: string;
  allowScripts?: Record<string, boolean>;
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
    packageManager?: { name?: string; version?: string; onFail?: string };
  };
};
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");
const packageLock = JSON.parse(readFileSync("package-lock.json", "utf8")) as {
  packages?: Record<string, { version?: string; resolved?: string; integrity?: string }>;
};

describe("deterministic package-manager work integrated after the nanoid predecessor", () => {
  it("preserves the predecessor security remediation while pinning the reviewed toolchain", () => {
    expect(packageLock.packages?.["node_modules/nanoid"]).toMatchObject({
      version: "3.3.18",
      resolved: "https://registry.npmjs.org/nanoid/-/nanoid-3.3.18.tgz",
      integrity:
        "sha512-DTg4MJbGMWkfi6VZFdNt2/caMbQy4Ou+Op/hJQvGEWcnVfoA1QA+xzRKAzw9jD6+GVOOeYr/mIcuDSdug6F6+w==",
    });
    expect(packageJson.packageManager).toBe("npm@11.17.0");
    expect(packageJson.devEngines?.runtime).toEqual({
      name: "node",
      version: "24.19.0",
      onFail: "error",
    });
    expect(packageJson.devEngines?.packageManager).toEqual({
      name: "npm",
      version: "11.17.0",
      onFail: "error",
    });
  });

  it("fails closed on unreviewed install scripts with exact reviewed identities", () => {
    expect(existsSync(".npmrc")).toBe(true);
    const npmConfig = existsSync(".npmrc") ? readFileSync(".npmrc", "utf8") : "";
    expect(npmConfig.split(/\r?\n/).filter(Boolean)).toContain("strict-allow-scripts=true");
    expect(packageJson.allowScripts).toEqual({
      "esbuild@0.28.1": true,
      "fsevents@2.3.3": false,
      "workerd@1.20260625.1": true,
    });
  });

  it("combines live-base lockfile control with the predecessor explicit install flags", () => {
    expect(ciWorkflow).toContain("name: verify live pull-request base before lockfile control");
    expect(ciWorkflow).toContain("name: verify lockfile change control");
    expect(ciWorkflow).toContain("name: refuse pull-request base drift after verification");
    expect(ciWorkflow).toContain("npm ci --legacy-peer-deps=false --install-links=false");
  });
});