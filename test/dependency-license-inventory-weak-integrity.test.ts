import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithIntegrity(integrity: string) {
  return JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/legacy-package": {
        version: "1.0.0",
        license: "MIT",
        resolved: "https://registry.npmjs.org/legacy-package/-/legacy-package-1.0.0.tgz",
        integrity,
      },
    },
  });
}

describe("dependency license inventory integrity authority", () => {
  it("rejects SHA-1 SRI instead of retaining weak artifact integrity as buyer evidence", () => {
    expect(() =>
      buildDependencyLicenseInventory(lockWithIntegrity("sha1-ZmFrZS1kaWdlc3Q=")),
    ).toThrow(
      "node_modules/legacy-package: supported SRI integrity required",
    );
  });

  it("continues to accept modern SRI algorithms", () => {
    for (const integrity of [
      "sha256-ZmFrZS1kaWdlc3Q=",
      "sha384-ZmFrZS1kaWdlc3Q=",
      "sha512-ZmFrZS1kaWdlc3Q=",
    ]) {
      const inventory = buildDependencyLicenseInventory(lockWithIntegrity(integrity));
      expect(inventory.packages[0]?.integrity).toBe(integrity);
    }
  });
});
