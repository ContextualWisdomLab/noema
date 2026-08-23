import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildDependencyLicenseInventory,
  generateDependencyLicenseInventory,
} from "../scripts/dependency-license-inventory.mjs";

const temporaryRoots: string[] = [];

function fixtureLock(packages: Record<string, unknown>) {
  return {
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "noema",
        version: "0.1.0",
        devDependencies: { alpha: "1.0.0" },
      },
      ...packages,
    },
  };
}

function packageRecord(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.0.0",
    resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
    integrity: "sha512-alpha",
    license: "MIT",
    dev: true,
    ...overrides,
  };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency license inventory", () => {
  it("emits deterministic exact-lock identities sorted by package path", () => {
    const lock = fixtureLock({
      "node_modules/zeta/node_modules/@scope/beta": packageRecord({
        version: "2.0.0",
        resolved: "https://registry.npmjs.org/@scope/beta/-/beta-2.0.0.tgz",
        integrity: "sha512-beta",
        license: "Apache-2.0",
        optional: true,
      }),
      "node_modules/alpha": packageRecord(),
    });
    const lockBytes = `${JSON.stringify(lock, null, 2)}\n`;

    const inventory = buildDependencyLicenseInventory(lockBytes);

    expect(inventory).toEqual({
      schema_version: 1,
      source: {
        path: "package-lock.json",
        sha256: createHash("sha256").update(lockBytes).digest("hex"),
        lockfile_version: 3,
      },
      packages: [
        {
          package_path: "node_modules/alpha",
          name: "alpha",
          version: "1.0.0",
          license: "MIT",
          resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
          integrity: "sha512-alpha",
          dev: true,
          optional: false,
        },
        {
          package_path: "node_modules/zeta/node_modules/@scope/beta",
          name: "@scope/beta",
          version: "2.0.0",
          license: "Apache-2.0",
          resolved: "https://registry.npmjs.org/@scope/beta/-/beta-2.0.0.tgz",
          integrity: "sha512-beta",
          dev: true,
          optional: true,
        },
      ],
    });
  });

  it("uses code-unit ordering rather than host locale collation", () => {
    const lockBytes = JSON.stringify(
      fixtureLock({
        "node_modules/alpha": packageRecord(),
        "node_modules/Zeta": packageRecord({
          resolved: "https://registry.npmjs.org/Zeta/-/Zeta-1.0.0.tgz",
          integrity: "sha512-zeta",
        }),
      }),
    );

    const inventory = buildDependencyLicenseInventory(lockBytes);

    expect(inventory.packages.map((entry) => entry.package_path)).toEqual([
      "node_modules/Zeta",
      "node_modules/alpha",
    ]);
  });

  it.each([
    ["license", { license: "" }],
    ["version", { version: "" }],
    ["resolved", { resolved: "" }],
    ["integrity", { integrity: "" }],
  ])("fails closed when a registry dependency lacks %s identity", (field, override) => {
    const lockBytes = JSON.stringify(
      fixtureLock({ "node_modules/alpha": packageRecord(override) }),
    );

    expect(() => buildDependencyLicenseInventory(lockBytes)).toThrow(
      `node_modules/alpha: non-empty ${field} required`,
    );
  });

  it("rejects malformed, duplicate-key, or unsupported lockfiles instead of inventing evidence", () => {
    expect(() => buildDependencyLicenseInventory("not-json")).toThrow(
      "package-lock.json must be valid JSON",
    );
    expect(() =>
      buildDependencyLicenseInventory(
        '{"lockfileVersion":3,"packages":{"node_modules/alpha":{"version":"1.0.0","version":"2.0.0","license":"MIT","resolved":"https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz","integrity":"sha512-alpha"}}}',
      ),
    ).toThrow("package-lock.json must not contain duplicate object keys");
    expect(() =>
      buildDependencyLicenseInventory(
        JSON.stringify({ lockfileVersion: 2, packages: {} }),
      ),
    ).toThrow("package-lock.json lockfileVersion 3 required");
    expect(() =>
      buildDependencyLicenseInventory(
        JSON.stringify({ lockfileVersion: 3, packages: [] }),
      ),
    ).toThrow("package-lock.json packages object required");
  });

  it("validates every third-party entry in the repository lockfile", () => {
    const lockBytes = readFileSync(
      new URL("../package-lock.json", import.meta.url),
      "utf8",
    );

    const inventory = buildDependencyLicenseInventory(lockBytes);

    expect(inventory.packages.length).toBeGreaterThan(0);
    expect(inventory.packages.every((entry) => entry.license.length > 0)).toBe(true);
    expect(inventory.source.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("writes reproducible JSON bytes and binds custom input paths honestly", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-inventory-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "custom-package-lock.json");
    const outputPath = join(root, "dependency-licenses.json");
    writeFileSync(
      lockPath,
      `${JSON.stringify(
        fixtureLock({ "node_modules/alpha": packageRecord() }),
        null,
        2,
      )}\n`,
      "utf8",
    );

    const first = generateDependencyLicenseInventory({ lockPath, outputPath });
    const firstBytes = readFileSync(outputPath, "utf8");
    const second = generateDependencyLicenseInventory({ lockPath, outputPath });
    const secondBytes = readFileSync(outputPath, "utf8");

    expect(first).toEqual(second);
    expect(first.source.path).toBe(lockPath);
    expect(firstBytes).toBe(secondBytes);
    expect(first.packages.map((entry) => entry.name)).toEqual(["alpha"]);
    expect(firstBytes.endsWith("\n")).toBe(true);
  });
});