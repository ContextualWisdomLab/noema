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
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?apiKey=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?apikey=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?accessKeyId=AKIAEXAMPLE",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?accesskeyid=AKIAEXAMPLE",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?sessionToken=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?sessiontoken=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?clientSecret=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?clientsecret=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?X-Amz-Signature=abc123",
    "https://registry.example/alpha.tgz?sv=2024-11-04&sig=secret",
    "git+ssh://ghp_secret@github.com/acme/alpha.git#0123456789abcdef",
    "git+ssh://user:secret@github.com/acme/alpha.git#0123456789abcdef",
    "https://registry.example/alpha.tgz#token=secret",
    "https://registry.example/alpha.tgz#artifact?token=secret",
    "git+ssh://git@github.com/acme/alpha.git#semver:^1.0.0?access_token=secret",
  ])("rejects credential-bearing resolved artifact authority: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it.each([
    "not a URI",
    "HTTPS://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    "https://registry.npmjs.org:443/alpha/-/alpha-1.0.0.tgz",
  ])("rejects non-canonical resolved artifact identity: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
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
