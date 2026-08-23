import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

const lockBytes = JSON.stringify({
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
    },
  },
});

describe("dependency license inventory source-path authority", () => {
  it.each([
    " package-lock.json",
    "package-lock.json ",
    "package-lock.json\nforged",
    "package-lock.json\u202eforged",
  ])("rejects non-canonical source path %j", (sourcePath) => {
    expect(() => buildDependencyLicenseInventory(lockBytes, { sourcePath })).toThrow(
      "package-lock.json source path must be canonical",
    );
  });
});
