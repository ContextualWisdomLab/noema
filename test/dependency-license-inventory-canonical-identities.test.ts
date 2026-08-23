import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithIdentity(field: "version" | "license" | "resolved" | "integrity", value: string) {
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
        [field]: value,
      },
    },
  });
}

function lockWithFlag(field: "dev" | "optional", value: unknown) {
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
        [field]: value,
      },
    },
  });
}

describe("dependency license inventory canonical identities", () => {
  it.each([
    ["version", " 1.0.0"],
    ["license", "MIT "],
    ["resolved", "\thttps://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz"],
    ["integrity", "sha512-alpha\n"],
  ] as const)("rejects non-canonical surrounding whitespace in %s", (field, value) => {
    expect(() => buildDependencyLicenseInventory(lockWithIdentity(field, value))).toThrow(
      `node_modules/alpha: canonical ${field} required`,
    );
  });

  it.each([
    ["version", "1.0.0\nforged"],
    ["license", "MIT\u0000Apache-2.0"],
    ["resolved", "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz\rforged"],
    ["integrity", "sha512-alpha\u007fforged"],
  ] as const)("rejects embedded ASCII control characters in %s", (field, value) => {
    expect(() => buildDependencyLicenseInventory(lockWithIdentity(field, value))).toThrow(
      `node_modules/alpha: canonical ${field} required`,
    );
  });

  it.each([
    ["version", "1.0.0\u0085forged"],
    ["license", "MIT\u202eApache-2.0"],
    ["resolved", "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz\u2066forged"],
    ["integrity", "sha512-alpha\ud800forged"],
  ] as const)("rejects Unicode control/format/surrogate spoofing in %s", (field, value) => {
    expect(() => buildDependencyLicenseInventory(lockWithIdentity(field, value))).toThrow(
      `node_modules/alpha: canonical ${field} required`,
    );
  });

  it.each([
    ["dev", "true"],
    ["dev", 1],
    ["optional", "false"],
    ["optional", 0],
  ] as const)("rejects non-boolean %s classification", (field, value) => {
    expect(() => buildDependencyLicenseInventory(lockWithFlag(field, value))).toThrow(
      `node_modules/alpha: boolean ${field} required when present`,
    );
  });
});
