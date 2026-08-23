import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithDevOptional(devOptional: unknown) {
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
        devOptional,
      },
    },
  });
}

describe("dependency license inventory devOptional classification", () => {
  it("preserves npm devOptional authority instead of collapsing it to production", () => {
    const inventory = buildDependencyLicenseInventory(lockWithDevOptional(true));

    expect(inventory.packages[0]).toMatchObject({
      dev: false,
      optional: false,
      dev_optional: true,
    });
  });

  it.each(["true", 1, null])(
    "rejects malformed present devOptional classification %j",
    (devOptional) => {
      expect(() => buildDependencyLicenseInventory(lockWithDevOptional(devOptional))).toThrow(
        "node_modules/alpha: boolean devOptional required when present",
      );
    },
  );
});
