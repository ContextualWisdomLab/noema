import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("release dependency-license evidence wiring", () => {
  it.each(["release:verify", "release:verify:strict"])(
    "%s generates the exact lockfile inventory before acquisition manifest materialization",
    (scriptName) => {
      const packageJson = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8"),
      );
      const script = packageJson.scripts[scriptName];

      expect(script).toContain("npm run release:dependency-license-inventory");
      expect(script.indexOf("npm run release:dependency-license-inventory")).toBeLessThan(
        script.indexOf("npm run acquisition:manifest"),
      );
    },
  );

  it("acquisition:audit refreshes the manifest after deterministic license evidence and before integrity verification", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const script = packageJson.scripts["acquisition:audit"];
    const inventoryIndex = script.indexOf("npm run release:dependency-license-inventory");
    const manifestIndex = script.indexOf("npm run acquisition:manifest");
    const integrityIndex = script.indexOf("npm run acquisition:integrity");

    expect(inventoryIndex).toBeGreaterThanOrEqual(0);
    expect(manifestIndex).toBeGreaterThanOrEqual(0);
    expect(integrityIndex).toBeGreaterThanOrEqual(0);
    expect(inventoryIndex).toBeLessThan(manifestIndex);
    expect(manifestIndex).toBeLessThan(integrityIndex);
  });
});
