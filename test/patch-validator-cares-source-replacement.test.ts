import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dockerfile = readFileSync("Dockerfile.patch-validator", "utf8");

describe("patch-validator c-ares source replacement", () => {
  it("removes the vendored Node c-ares tree before extracting the reviewed replacement", () => {
    const removeVendoredTree = "rm -rf /usr/src/node/deps/cares";
    const createReplacementTree = "mkdir -p /usr/src/node/deps/cares";
    const extractReviewedTree =
      "tar -xzf /tmp/cares.tar.gz --strip-components=1 -C /usr/src/node/deps/cares";

    expect(dockerfile).toContain(removeVendoredTree);
    expect(dockerfile).toContain(createReplacementTree);
    expect(dockerfile).toContain(extractReviewedTree);
    expect(dockerfile.indexOf(removeVendoredTree)).toBeLessThan(
      dockerfile.indexOf(extractReviewedTree),
    );
    expect(dockerfile.indexOf(createReplacementTree)).toBeLessThan(
      dockerfile.indexOf(extractReviewedTree),
    );
  });
});
