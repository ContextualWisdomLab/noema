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

  it("acquisition:audit refreshes deterministic license evidence before integrity verification", () => {
    const packageJson = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    const script = packageJson.scripts["acquisition:audit"];

    expect(script).toContain("npm run release:dependency-license-inventory");
    expect(script.indexOf("npm run release:dependency-license-inventory")).toBeLessThan(
      script.indexOf("npm run acquisition:integrity"),
    );
  });
});
