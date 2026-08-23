import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithInstallScript(hasInstallScript: unknown) {
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
        hasInstallScript,
      },
    },
  });
}

describe("dependency license inventory install-script authority", () => {
  it.each([true, false])(
    "preserves npm hasInstallScript=%s authority for buyer dependency evidence",
    (hasInstallScript) => {
      const inventory = buildDependencyLicenseInventory(lockWithInstallScript(hasInstallScript));

      expect(inventory.packages[0]).toMatchObject({
        has_install_script: hasInstallScript,
      });
    },
  );

  it.each(["true", 1, null])(
    "rejects malformed present hasInstallScript authority %j",
    (hasInstallScript) => {
      expect(() => buildDependencyLicenseInventory(lockWithInstallScript(hasInstallScript))).toThrow(
        "node_modules/alpha: boolean hasInstallScript required when present",
      );
    },
  );
});
