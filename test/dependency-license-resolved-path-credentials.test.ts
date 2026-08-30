import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithResolved(resolved: string) {
  return JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/alpha": {
        version: "1.0.0",
        license: "MIT",
        resolved,
        integrity: "sha512-ujzlhmfKmxKzwM3MTaV/mWKuynBlxDp9nAJzMv258LvPaQBChogP49jz/Y8D3f/XSF/ZTJ06OGGOoQaR2Nan+g==",
      },
    },
  });
}

describe("dependency license resolved artifact path credentials", () => {
  it.each([
    "https://registry.example/alpha.tgz;token=buyer-secret",
    "https://registry.example/alpha.tgz%3Btoken%3Dbuyer-secret",
  ])("rejects credential-bearing artifact path parameters: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it.each([
    "https://registry.example/alpha.tgz;source=https://user:buyer-secret@mirror.example/alpha.tgz",
    "https://registry.example/alpha.tgz%3Bsource%3Dhttps%3A%2F%2Fuser%3Abuyer-secret%40mirror.example%2Falpha.tgz",
  ])("rejects credential-bearing nested artifact path parameter values: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it.each([
    "https://registry.example/alpha.tgz;source=//user:buyer-value@mirror.example/alpha.tgz",
    "https://registry.example/alpha.tgz%3Bsource%3D%2F%2Fuser%3Abuyer-value%40mirror.example%2Falpha.tgz",
  ])("rejects credential-bearing network-path artifact parameter values: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it.each([
    "https://registry.example/alpha.tgz;channel=stable",
    "https://registry.example/alpha;signature.asc",
    "https://registry.example/alpha;channel=stable/download/token=public/file.tgz",
  ])("preserves a semicolon path without credential parameter authority: %s", (resolved) => {
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));

    expect(inventory.packages[0].resolved).toBe(resolved);
  });
});
