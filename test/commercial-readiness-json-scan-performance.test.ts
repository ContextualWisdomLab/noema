import { describe, expect, it, vi } from "vitest";
import { hasDuplicateJsonObjectKeys } from "../scripts/normalize-commercial-readiness-evidence.mjs";

describe("commercial-readiness JSON scanner performance contract", () => {
  it("scans a dense primitive array without allocating suffix substrings", () => {
    const primitiveValues = ["0", "-1.25e+3", "true", "false", "null"];
    const json = `[${Array.from(
      { length: 20_000 },
      (_, index) => primitiveValues[index % primitiveValues.length],
    ).join(",")}]`;
    const slice = vi
      .spyOn(String.prototype, "slice")
      .mockImplementation(() => {
        throw new Error("primitive scanning must not copy the remaining JSON suffix");
      });

    try {
      expect(hasDuplicateJsonObjectKeys(json)).toBe(false);
    } finally {
      slice.mockRestore();
    }
  });
});
