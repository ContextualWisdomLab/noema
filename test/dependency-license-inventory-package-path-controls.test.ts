import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithPackagePath(packagePath: string) {
  return JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      [packagePath]: {
        version: "1.0.0",
        license: "MIT",
        resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
        integrity: "sha512-alpha",
      },
    },
  });
}

describe("dependency license inventory package-path authority", () => {
  it.each([
    "node_modules/alpha\nforged",
    "node_modules/alpha\u0085forged",
    "node_modules/alpha\u202eforged",
    "node_modules/@scope/alpha\u2066forged",
  ])("rejects control/format-spoofed package path %j", (packagePath) => {
    expect(() => buildDependencyLicenseInventory(lockWithPackagePath(packagePath))).toThrow(
      `${packagePath}: canonical package name required`,
    );
  });
});
