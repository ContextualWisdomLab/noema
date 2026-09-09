import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");

describe("patch-validator c-ares source replacement", () => {
  it("replaces reviewed upstream sources atomically while preserving Node-owned integration glue", () => {
    const preserveConfig =
      "cp -R /usr/src/node/deps/cares/config /tmp/node-cares-integration/config";
    const preserveGitignore =
      "cp /usr/src/node/deps/cares/.gitignore /tmp/node-cares-integration/.gitignore";
    const preserveGyp =
      "cp /usr/src/node/deps/cares/cares.gyp /tmp/node-cares-integration/cares.gyp";
    const preserveGn =
      "cp /usr/src/node/deps/cares/*.gn /usr/src/node/deps/cares/*.gni /tmp/node-cares-integration/";
    const extractReviewedTree =
      "tar -xzf /tmp/cares.tar.gz --strip-components=1 -C /tmp/cares-reviewed";
    const removeReviewedTests = "rm -rf /tmp/cares-reviewed/test";
    const removeVendoredTree = "rm -rf /usr/src/node/deps/cares";
    const installReviewedTree = "mv /tmp/cares-reviewed /usr/src/node/deps/cares";

    for (const required of [
      preserveConfig,
      preserveGitignore,
      preserveGyp,
      preserveGn,
      extractReviewedTree,
      removeReviewedTests,
      removeVendoredTree,
      installReviewedTree,
    ]) {
      expect(dockerfile).toContain(required);
    }

    expect(dockerfile.indexOf(preserveGyp)).toBeLessThan(
      dockerfile.indexOf(removeVendoredTree),
    );
    expect(dockerfile.indexOf(extractReviewedTree)).toBeLessThan(
      dockerfile.indexOf(removeVendoredTree),
    );
    expect(dockerfile.indexOf(removeVendoredTree)).toBeLessThan(
      dockerfile.indexOf(installReviewedTree),
    );
    expect(dockerfile).not.toContain(
      "tar -xzf /tmp/cares.tar.gz --strip-components=1 -C /usr/src/node/deps/cares",
    );
  });
});
