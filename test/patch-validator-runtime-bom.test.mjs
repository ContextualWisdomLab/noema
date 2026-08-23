import { describe, expect, it } from "vitest";

import { parseUnifiedPatch } from "../patch-validator/runtime.mjs";

describe("UTF-8 BOM-only patch input", () => {
  it("rejects decoded input that contains no diff headers", () => {
    expect(() =>
      parseUnifiedPatch(Buffer.from([0xef, 0xbb, 0xbf])),
    ).toThrow(/no diff headers/);
  });
});
