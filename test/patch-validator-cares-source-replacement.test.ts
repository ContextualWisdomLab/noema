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
    const replaceReviewedConfig = "rm -rf /tmp/cares-reviewed/config";
    const restoreNodeConfig =
      "cp -R /tmp/node-cares-integration/config /tmp/cares-reviewed/config";
    const removeVendoredTree = "rm -rf /usr/src/node/deps/cares";
    const installReviewedTree = "mv /tmp/cares-reviewed /usr/src/node/deps/cares";
    const assertLinuxConfig =
      "test -f /usr/src/node/deps/cares/config/linux/ares_config.h";

    for (const required of [
      preserveConfig,
      preserveGitignore,
      preserveGyp,
      preserveGn,
      extractReviewedTree,
      removeReviewedTests,
      replaceReviewedConfig,
      restoreNodeConfig,
      removeVendoredTree,
      installReviewedTree,
      assertLinuxConfig,
    ]) {
      expect(dockerfile).toContain(required);
    }

    expect(dockerfile.indexOf(extractReviewedTree)).toBeLessThan(
      dockerfile.indexOf(replaceReviewedConfig),
    );
    expect(dockerfile.indexOf(replaceReviewedConfig)).toBeLessThan(
      dockerfile.indexOf(restoreNodeConfig),
    );
    expect(dockerfile.indexOf(preserveGyp)).toBeLessThan(
      dockerfile.indexOf(removeVendoredTree),
    );
    expect(dockerfile.indexOf(extractReviewedTree)).toBeLessThan(
      dockerfile.indexOf(removeVendoredTree),
    );
    expect(dockerfile.indexOf(removeVendoredTree)).toBeLessThan(
      dockerfile.indexOf(installReviewedTree),
    );
    expect(dockerfile.indexOf(installReviewedTree)).toBeLessThan(
      dockerfile.indexOf(assertLinuxConfig),
    );
    expect(dockerfile).not.toContain(
      "tar -xzf /tmp/cares.tar.gz --strip-components=1 -C /usr/src/node/deps/cares",
    );
  });
});
