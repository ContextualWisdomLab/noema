import { describe, expect, it } from "vitest";
import { requireCanonicalReleaseBomRef } from "../scripts/lib/release-sbom-authority.mjs";

describe("release SBOM canonical authority coverage", () => {
  it.each([
    [null, "non-string"],
    ["", "empty"],
    [" dependency@1.0.0 ", "surrounding whitespace"],
    ["dependency\n@1.0.0", "control character"],
    ["dependency\u200B@1.0.0", "format character"],
    ["dependency\u2028@1.0.0", "line separator"],
    ["dependency\u2029@1.0.0", "paragraph separator"],
    ["cafe\u0301@1.0.0", "non-NFC Unicode identity"],
    ["dependency\uD800@1.0.0", "lone surrogate code unit"],
  ])("rejects %s as %s authority", (value) => {
    expect(() => requireCanonicalReleaseBomRef(value, "SBOM bom-ref")).toThrow(
      "canonical non-empty bom-ref identity",
    );
  });

  it("preserves a distinct canonical bom-ref byte-for-byte", () => {
    expect(requireCanonicalReleaseBomRef("dependency@1.0.0", "SBOM bom-ref")).toBe(
      "dependency@1.0.0",
    );
  });

  it("preserves NFC Unicode identity byte-for-byte rather than normalizing it", () => {
    expect(requireCanonicalReleaseBomRef("caf\u00e9@1.0.0", "SBOM bom-ref")).toBe(
      "caf\u00e9@1.0.0",
    );
  });
});
