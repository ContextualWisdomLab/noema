import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithInBundle(inBundle: unknown) {
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
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity: "sha512-alpha",
        inBundle,
      },
    },
  });
}

describe("dependency license inventory inBundle distribution classification", () => {
  it.each([true, false])(
    "preserves npm inBundle=%s authority for acquisition evidence",
    (inBundle) => {
      const inventory = buildDependencyLicenseInventory(lockWithInBundle(inBundle));

      expect(inventory.packages[0]).toMatchObject({
        in_bundle: inBundle,
      });
    },
  );

  it.each(["true", 1, null])(
    "rejects malformed present inBundle classification %j",
    (inBundle) => {
      expect(() => buildDependencyLicenseInventory(lockWithInBundle(inBundle))).toThrow(
        "node_modules/alpha: boolean inBundle required when present",
      );
    },
  );
});
