import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockfileWithIntegrity(integrity: string) {
  return JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/alpha": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity,
        license: "MIT",
      },
    },
  });
}

describe("dependency license inventory SRI digest authority", () => {
  it("rejects algorithm labels whose decoded digest length does not match the algorithm", () => {
    expect(() =>
      buildDependencyLicenseInventory(lockfileWithIntegrity("sha256-YQ==")),
    ).toThrow("node_modules/alpha: supported SRI integrity required");

    const validSha256 = `sha256-${Buffer.alloc(32, 0xa5).toString("base64")}`;
    expect(
      buildDependencyLicenseInventory(lockfileWithIntegrity(validSha256)).packages[0]
        .integrity,
    ).toBe(validSha256);
  });
});
