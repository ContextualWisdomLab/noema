import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

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

describe("dependency license inventory resolved artifact credentials", () => {
  it.each([
    "https://token@registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    "https://user:secret@registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?token=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?access_token=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?X-Amz-Signature=abc123",
    "https://registry.example/alpha.tgz?sv=2024-11-04&sig=secret",
    "git+ssh://ghp_secret@github.com/acme/alpha.git#0123456789abcdef",
    "git+ssh://user:secret@github.com/acme/alpha.git#0123456789abcdef",
    "https://registry.example/alpha.tgz#token=secret",
  ])("rejects credential-bearing resolved artifact authority: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it("rejects an unparseable resolved artifact identity instead of bypassing credential inspection", () => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved("not a URI"))).toThrow(
      "node_modules/alpha: canonical resolved artifact URI required",
    );
  });

  it("preserves an ordinary immutable HTTPS artifact URL", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithResolved("https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz"),
    );

    expect(inventory.packages[0].resolved).toBe(
      "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    );
  });

  it("does not misclassify the conventional git SSH username as a secret", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithResolved("git+ssh://git@github.com/acme/alpha.git#0123456789abcdef"),
    );

    expect(inventory.packages[0].resolved).toBe(
      "git+ssh://git@github.com/acme/alpha.git#0123456789abcdef",
    );
  });
});
