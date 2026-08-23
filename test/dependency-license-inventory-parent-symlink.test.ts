import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { generateDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

const temporaryRoots: string[] = [];

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency license inventory custom output parents", () => {
  it("refuses a symlinked custom output parent instead of writing through it", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-custom-parent-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "package-lock.json");
    const redirectedTarget = join(root, "redirected-target");
    const redirectedParent = join(root, "redirected-parent");
    const outputPath = join(redirectedParent, "dependency-licenses.json");

    mkdirSync(redirectedTarget);
    symlinkSync(redirectedTarget, redirectedParent, "dir");
    writeFileSync(
      lockPath,
      `${JSON.stringify({
        name: "noema",
        version: "0.1.0",
        lockfileVersion: 3,
        requires: true,
        packages: {
          "": { name: "noema", version: "0.1.0" },
          "node_modules/alpha": {
            version: "1.0.0",
            resolved: "https://registry.npmjs.org/alpha/-/alpha-1.0.0.tgz",
            integrity: "sha512-alpha",
            license: "MIT",
          },
        },
      })}\n`,
      "utf8",
    );

    expect(() =>
      generateDependencyLicenseInventory({ lockPath, outputPath }),
    ).toThrow(/output parent must not be a symlink/);
    expect(existsSync(join(redirectedTarget, "dependency-licenses.json"))).toBe(false);
  });
});
