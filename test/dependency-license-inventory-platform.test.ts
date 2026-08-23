import { describe, expect, it } from "vitest";
import { buildDependencyLicenseInventory } from "../scripts/dependency-license-inventory.mjs";

function lockWithPlatformAuthority({ cpu, os }: { cpu?: unknown; os?: unknown }) {
  return JSON.stringify({
    name: "noema",
    version: "0.1.0",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": { name: "noema", version: "0.1.0" },
      "node_modules/platform-package": {
        version: "1.0.0",
        license: "MIT",
        resolved: "https://registry.npmjs.org/platform-package/-/platform-package-1.0.0.tgz",
        integrity: "sha512-platform",
        ...(cpu === undefined ? {} : { cpu }),
        ...(os === undefined ? {} : { os }),
      },
    },
  });
}

describe("dependency license inventory platform authority", () => {
  it("preserves npm cpu/os constraints for buyer dependency evidence", () => {
    const inventory = buildDependencyLicenseInventory(
      lockWithPlatformAuthority({ cpu: ["x64", "arm64"], os: ["darwin", "linux"] }),
    );

    expect(inventory.packages[0]).toMatchObject({
      cpu: ["x64", "arm64"],
      os: ["darwin", "linux"],
    });
  });

  it("omits absent cpu/os authority rather than inventing applicability", () => {
    const inventory = buildDependencyLicenseInventory(lockWithPlatformAuthority({}));

    expect(inventory.packages[0]).not.toHaveProperty("cpu");
    expect(inventory.packages[0]).not.toHaveProperty("os");
  });

  it.each([
    { field: "cpu", value: "x64" },
    { field: "os", value: "linux" },
    { field: "cpu", value: [] },
    { field: "os", value: [""] },
    { field: "cpu", value: ["x64", 1] },
    { field: "os", value: ["linux", " linux"] },
    { field: "cpu", value: ["x64\u0000"] },
  ])("rejects malformed present $field authority", ({ field, value }) => {
    const lock = lockWithPlatformAuthority({ [field]: value });
    expect(() => buildDependencyLicenseInventory(lock)).toThrow(
      `node_modules/platform-package: canonical ${field} array required when present`,
    );
  });
});
