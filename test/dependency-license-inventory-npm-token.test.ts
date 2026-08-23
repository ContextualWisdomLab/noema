import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

const npmToken = "npm_abcdefghijklmnopqrstuvwxyz0123456789";

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
        integrity: "sha512-alpha",
      },
    },
  });
}

describe("dependency license inventory npm credential tokens", () => {
  it.each([
    `https://registry.example/download/${npmToken}/alpha.tgz`,
    `https://registry.example/alpha.tgz?mirror=${npmToken}`,
    `https://registry.example/alpha.tgz#${npmToken}`,
    "https://registry.example/alpha.tgz?mirror=%6epm_abcdefghijklmnopqrstuvwxyz0123456789",
  ])("rejects strong npm token material in resolved artifact authority: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it("preserves an ordinary npm-prefixed metadata word that is not a token", () => {
    const resolved = "https://registry.example/alpha.tgz?channel=npm_package_metadata";
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));
    expect(inventory.packages[0].resolved).toBe(resolved);
  });
});
