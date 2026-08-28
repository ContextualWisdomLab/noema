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

function fixtureLockBytes() {
  return `${JSON.stringify({
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
  })}\n`;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    const root = temporaryRoots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe("dependency license inventory parent paths", () => {
  it("refuses a symlinked custom output parent instead of writing through it", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-custom-parent-"));
    temporaryRoots.push(root);
    const lockPath = join(root, "package-lock.json");
    const redirectedTarget = join(root, "redirected-target");
    const redirectedParent = join(root, "redirected-parent");
    const outputPath = join(redirectedParent, "dependency-licenses.json");

    mkdirSync(redirectedTarget);
    symlinkSync(redirectedTarget, redirectedParent, "dir");
    writeFileSync(lockPath, fixtureLockBytes(), "utf8");

    expect(() =>
      generateDependencyLicenseInventory({ lockPath, outputPath }),
    ).toThrow(/output parent must not be a symlink/);
    expect(existsSync(join(redirectedTarget, "dependency-licenses.json"))).toBe(false);
  });

  it("refuses a symlinked lockfile parent instead of authenticating redirected bytes", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-input-parent-"));
    temporaryRoots.push(root);
    const trustedParent = join(root, "trusted-input");
    const redirectedTarget = join(root, "redirected-input");
    const lockPath = join(trustedParent, "package-lock.json");
    const outputPath = join(root, "dependency-licenses.json");

    mkdirSync(redirectedTarget);
    writeFileSync(join(redirectedTarget, "package-lock.json"), fixtureLockBytes(), "utf8");
    symlinkSync(redirectedTarget, trustedParent, "dir");

    expect(() =>
      generateDependencyLicenseInventory({ lockPath, outputPath }),
    ).toThrow(/input parent must not be a symlink/);
    expect(existsSync(outputPath)).toBe(false);
  });

  it("refuses an output path whose dot segment changes meaning after symlink traversal", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-output-dot-segment-"));
    const outside = mkdtempSync(join(tmpdir(), "noema-license-output-outside-"));
    temporaryRoots.push(root, outside);
    const lockPath = join(root, "package-lock.json");
    const redirectedParent = join(root, "redirected-parent");
    const redirectedTarget = join(outside, "nested");
    const escapedOutput = join(outside, "dependency-licenses.json");
    const outputPath = `${redirectedParent}/../dependency-licenses.json`;

    mkdirSync(redirectedTarget);
    symlinkSync(redirectedTarget, redirectedParent, "dir");
    writeFileSync(lockPath, fixtureLockBytes(), "utf8");

    expect(() =>
      generateDependencyLicenseInventory({ lockPath, outputPath }),
    ).toThrow(/canonical output path required/);
    expect(existsSync(escapedOutput)).toBe(false);
  });

  it("refuses an input path whose dot segment changes meaning after symlink traversal", () => {
    const root = mkdtempSync(join(tmpdir(), "noema-license-input-dot-segment-"));
    const outside = mkdtempSync(join(tmpdir(), "noema-license-input-outside-"));
    temporaryRoots.push(root, outside);
    const redirectedParent = join(root, "redirected-parent");
    const redirectedTarget = join(outside, "nested");
    const escapedLock = join(outside, "package-lock.json");
    const lockPath = `${redirectedParent}/../package-lock.json`;
    const outputPath = join(root, "dependency-licenses.json");

    mkdirSync(redirectedTarget);
    symlinkSync(redirectedTarget, redirectedParent, "dir");
    writeFileSync(escapedLock, fixtureLockBytes(), "utf8");

    expect(() =>
      generateDependencyLicenseInventory({ lockPath, outputPath }),
    ).toThrow(/canonical input path required/);
    expect(existsSync(outputPath)).toBe(false);
  });
});
