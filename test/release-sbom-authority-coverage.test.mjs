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
});
