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

  it("continues to accept modern SRI algorithms with algorithm-sized digests", () => {
    for (const integrity of [
      "sha256-bRYJ57z/Lx271kuqH6EypeeBrJIJ9HX7vy57S+Fedms=",
      "sha384-laO4HXxnaL930+o4t6XS9YCpTAU/u++ngpdDUuMGLT3O5e0HHY4c+cQFkm4c77GB",
      "sha512-32hOqBzNFYIMeVIm2Pas733Ve7IXiD5OsiUxK4GrvXDzJwWWEBDUndfiaJPApcjqauu1cTcf1Id6C8fPRh6kEg==",
    ]) {
      const inventory = buildDependencyLicenseInventory(lockWithIntegrity(integrity));
      expect(inventory.packages[0]?.integrity).toBe(integrity);
    }
  });
});
