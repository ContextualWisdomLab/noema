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
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?%2574oken=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?foo[token]=secret",
    "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz?auth.token=secret",
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
    "https://registry.example/alpha.tgz?mirror=token%3Dsecret",
    "https://registry.example/alpha.tgz?mirror=clientSecret%253Dsecret",
    "https://registry.example/alpha.tgz?mirror=auth.token%3Dsecret",
    "https://registry.example/alpha.tgz?mirror=https%3A%2F%2Fcdn.example%2Fa.tgz%3Ftoken%3Dsecret",
    "https://registry.example/alpha.tgz?mirror=https%253A%252F%252Fcdn.example%252Fa.tgz%253FclientSecret%253Dsecret",
    "https://registry.example/alpha.tgz?mirror=https%3A%2F%2Fcdn.example%2Fa.tgz%23token%3Dsecret",
    "https://registry.example/alpha.tgz?mirror=https%3A%2F%2Fuser%3Asecret%40cdn.example%2Fa.tgz",
    "https://registry.example/alpha.tgz?mirror=git%2Bssh%3A%2F%2Fghp_secret%40github.com%2Facme%2Falpha.git",
    "git+ssh://ghp_secret@github.com/acme/alpha.git#0123456789abcdef",
    "git+ssh://user:secret@github.com/acme/alpha.git#0123456789abcdef",
    "https://registry.example/alpha.tgz#token=secret",
    "https://registry.example/alpha.tgz#artifact?token=secret",
    "git+ssh://git@github.com/acme/alpha.git#semver:^1.0.0?access_token=secret",
    "https://registry.example/alpha.tgz#artifact%3Ftoken=secret",
    "https://registry.example/alpha.tgz#artifact%253FclientSecret=secret",
    "https://registry.example/alpha.tgz#artifact%253F%252574oken=secret",
  ])("rejects credential-bearing resolved artifact authority: %s", (resolved) => {
    expect(() => buildDependencyLicenseInventory(lockWithResolved(resolved))).toThrow(
      "node_modules/alpha: credential-free resolved required",
    );
  });

  it.each([
    "not a URI",
    "HTTPS://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    "https://registry.npmjs.org:443/alpha/-/alpha-1.0.0.tgz",
    "https://registry.example/alpha.tgz#artifact%ZZ",
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

  it("preserves a benign nested parameter assignment without credential authority", () => {
    const resolved = "https://registry.example/alpha.tgz?mirror=channel%3Dstable";
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));

    expect(inventory.packages[0].resolved).toBe(resolved);
  });

  it("preserves credential-like words that are only part of a nested artifact path", () => {
    const resolved =
      "https://registry.example/alpha.tgz?mirror=https%3A%2F%2Fcdn.example%2Ftoken%3Dpublic%2Fsecret%3Dmetadata";
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));

    expect(inventory.packages[0].resolved).toBe(resolved);
  });

  it("preserves a benign nested artifact URL parameter without credential authority", () => {
    const resolved =
      "https://registry.example/alpha.tgz?mirror=https%3A%2F%2Fcdn.example%2Fa.tgz%3Fchannel%3Dstable";
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));

    expect(inventory.packages[0].resolved).toBe(resolved);
  });

  it("preserves the conventional git username inside a nested SSH artifact URL", () => {
    const resolved =
      "https://registry.example/alpha.tgz?mirror=git%2Bssh%3A%2F%2Fgit%40github.com%2Facme%2Falpha.git%230123456789abcdef";
    const inventory = buildDependencyLicenseInventory(lockWithResolved(resolved));

    expect(inventory.packages[0].resolved).toBe(resolved);
  });

  it("preserves a benign fragment-local query while exercising its nested parameter boundary", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithResolved("https://registry.example/alpha.tgz#artifact?channel=stable"),
    );

    expect(inventory.packages[0].resolved).toBe(
      "https://registry.example/alpha.tgz#artifact?channel=stable",
    );
  });

  it("does not misclassify an encoded benign fragment as a credential", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithResolved("git+ssh://git@github.com/acme/alpha.git#semver:%5E1.0.0"),
    );

    expect(inventory.packages[0].resolved).toBe(
      "git+ssh://git@github.com/acme/alpha.git#semver:%5E1.0.0",
    );
  });

  it("preserves an encoded literal percent in a benign fragment", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithResolved("git+ssh://git@github.com/acme/alpha.git#sha%25suffix"),
    );

    expect(inventory.packages[0].resolved).toBe(
      "git+ssh://git@github.com/acme/alpha.git#sha%25suffix",
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
