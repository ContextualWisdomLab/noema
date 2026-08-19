import { describe, expect, it } from "vitest";

import { generateEmbeddedRuntimeInventory } from "../scripts/lib/patch-validator-embedded-runtime-inventory.mjs";

const versions = {
  node: "24.19.0",
  acorn: "8.15.0",
};

const validDigest = `sha256:${"4".repeat(64)}`;

describe("patch-validator embedded runtime image-digest binding", () => {
  it("preserves an exact lowercase sha256 image digest", () => {
    const { inventory } = generateEmbeddedRuntimeInventory(versions, validDigest);

    expect(inventory.validator_image_digest).toBe(validDigest);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["short", "sha256:1234"],
    ["wrong algorithm", `sha512:${"4".repeat(128)}`],
    ["uppercase hex", `sha256:${"A".repeat(64)}`],
    ["suffix", `${validDigest}:extra`],
  ])("fails closed on a %s validator image digest", (_label, digest) => {
    expect(() => generateEmbeddedRuntimeInventory(versions, digest)).toThrow(
      /validator image digest/i,
    );
  });
});
